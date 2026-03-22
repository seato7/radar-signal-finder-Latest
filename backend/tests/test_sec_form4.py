import pytest
from backend.etl.sec_form4 import parse_form4_xml, run_form4_etl
from backend.db import get_db
from unittest.mock import patch

MOCK_FORM4_XML = """<?xml version="1.0"?>
<ownershipDocument xmlns="http://www.sec.gov/edgar/document/ownership/2006-05-01">
    <issuer>
        <issuerCik>0001234567</issuerCik>
        <issuerName>Example Corp</issuerName>
        <issuerTradingSymbol>EXMP</issuerTradingSymbol>
    </issuer>
    <reportingOwner>
        <reportingOwnerId>
            <rptOwnerCik>0009876543</rptOwnerCik>
            <rptOwnerName>John Insider</rptOwnerName>
        </reportingOwnerId>
    </reportingOwner>
    <nonDerivativeTable>
        <nonDerivativeTransaction>
            <transactionDate>
                <value>2024-01-15</value>
            </transactionDate>
            <transactionCoding>
                <transactionCode>P</transactionCode>
            </transactionCoding>
            <transactionAmounts>
                <transactionShares>
                    <value>10000</value>
                </transactionShares>
                <transactionPricePerShare>
                    <value>50.00</value>
                </transactionPricePerShare>
                <transactionAcquiredDisposedCode>
                    <value>A</value>
                </transactionAcquiredDisposedCode>
            </transactionAmounts>
        </nonDerivativeTransaction>
    </nonDerivativeTable>
</ownershipDocument>
"""

MOCK_ATOM_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
        <title>4 - Example Corp (0001234567)</title>
        <link href="https://www.sec.gov/cgi-bin/browse-edgar?accession-number=0001234567-24-000001"/>
        <summary>Form 4 filing</summary>
        <updated>2024-01-16T10:00:00Z</updated>
    </entry>
</feed>
"""

def test_parse_form4_xml():
    """Test Form 4 XML parsing"""
    parsed = parse_form4_xml(MOCK_FORM4_XML)
    
    assert parsed["issuer_name"] == "Example Corp"
    assert parsed["issuer_ticker"] == "EXMP"
    assert parsed["reported_holder"] == "John Insider"
    assert len(parsed["transactions"]) == 1
    
    tx = parsed["transactions"][0]
    assert tx["code"] == "P"
    assert tx["date"] == "2024-01-15"
    assert tx["shares"] == 10000.0
    assert tx["price"] == 50.0
    assert tx["acquired_disposed"] == "A"

@pytest.mark.asyncio
async def test_form4_etl_idempotency():
    """Test Form 4 ETL idempotency - second run inserts 0"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"signal_type": {"$in": ["insider_buy", "insider_sell"]}})
    await db.assets.delete_many({"ticker": "EXMP"})
    
    # Mock HTTP calls
    with patch("backend.etl.sec_form4.fetch_form4_atom_feed") as mock_atom, \
         patch("backend.etl.sec_form4.fetch_form4_xml") as mock_xml:
        
        mock_atom.return_value = [{
            "title": "4 - Example Corp",
            "link": "https://www.sec.gov/cgi-bin/browse-edgar?accession-number=0001234567-24-000001",
            "summary": "Form 4",
            "updated": "2024-01-16T10:00:00Z",
        }]
        mock_xml.return_value = MOCK_FORM4_XML
        
        # First run
        result1 = await run_form4_etl(limit=10)
        assert result1["signals_created"] > 0
        created_first = result1["signals_created"]
        
        # Second run
        result2 = await run_form4_etl(limit=10)
        assert result2["signals_created"] == 0
        assert result2["signals_skipped"] == created_first

@pytest.mark.asyncio
async def test_form4_signal_mapping():
    """Test insider_buy signal maps to theme and affects InsiderPoliticianConfirm"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"signal_type": "insider_buy"})
    await db.assets.delete_many({"ticker": "EXMP"})
    await db.themes.delete_many({"name": "Test Theme"})
    
    # Create test theme with keywords
    theme_doc = {
        "name": "Test Theme",
        "keywords": ["example", "corp"],
        "alpha": 1.0,
    }
    await db.themes.insert_one(theme_doc)
    
    # Mock HTTP calls
    with patch("backend.etl.sec_form4.fetch_form4_atom_feed") as mock_atom, \
         patch("backend.etl.sec_form4.fetch_form4_xml") as mock_xml:
        
        mock_atom.return_value = [{
            "title": "4 - Example Corp",
            "link": "https://www.sec.gov/cgi-bin/browse-edgar?accession-number=0001234567-24-000001",
            "summary": "Form 4",
            "updated": "2024-01-16T10:00:00Z",
        }]
        mock_xml.return_value = MOCK_FORM4_XML
        
        # Run ETL
        await run_form4_etl(limit=10)
        
        # Run theme mapper
        from backend.services.theme_mapper import run_theme_mapper
        await run_theme_mapper()
        
        # Verify signal was created
        signal = await db.signals.find_one({"signal_type": "insider_buy", "ticker": "EXMP"})
        assert signal is not None
        assert signal.get("direction") == "up"
        assert signal.get("magnitude") == 1.0
        
        # Verify citation
        citation = signal.get("oa_citation")
        assert citation is not None
        assert citation["source"] == "SEC Form 4"
        assert "sec.gov" in citation["url"]
        
        # Verify raw data
        raw = signal.get("raw", {})
        assert raw.get("issuer_name") == "Example Corp"
        assert raw.get("reported_holder") == "John Insider"
        assert raw.get("shares") == 10000.0

@pytest.mark.asyncio
async def test_form4_sale_transaction():
    """Test insider_sell signal creation"""
    # Mock Form 4 with sale transaction
    SALE_XML = MOCK_FORM4_XML.replace("<transactionCode>P</transactionCode>", 
                                      "<transactionCode>S</transactionCode>")
    SALE_XML = SALE_XML.replace("<value>A</value>", "<value>D</value>")
    
    parsed = parse_form4_xml(SALE_XML)
    tx = parsed["transactions"][0]
    
    # Verify transaction is classified as sale
    assert tx["code"] == "S"
    assert tx["acquired_disposed"] == "D"
