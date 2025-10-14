import pytest
from backend.etl.sec_13f_holdings import (
    parse_infotable_xml,
    classify_delta,
    run_13f_holdings_etl
)
from backend.db import get_db

# Sample 13F XML fixture
SAMPLE_13F_XML = """<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
    <infoTable>
        <nameOfIssuer>EXAMPLE CORP</nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>123456789</cusip>
        <value>5000</value>
        <shrsOrPrnAmt>
            <sshPrnamt>1000</sshPrnamt>
            <sshPrnamtType>SH</sshPrnamtType>
        </shrsOrPrnAmt>
    </infoTable>
    <infoTable>
        <nameOfIssuer>ANOTHER CORP</nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>987654321</cusip>
        <value>10000</value>
        <shrsOrPrnAmt>
            <sshPrnamt>2000</sshPrnamt>
            <sshPrnamtType>SH</sshPrnamtType>
        </shrsOrPrnAmt>
    </infoTable>
</informationTable>
"""

@pytest.mark.asyncio
async def test_parse_13f_xml():
    """Test XML parsing extracts positions correctly"""
    positions = await parse_infotable_xml(
        SAMPLE_13F_XML,
        "https://sec.gov/example",
        "Test Manager LLC",
        "2024-03-31"
    )
    
    assert len(positions) == 2
    assert positions[0]["cusip"] == "123456789"
    assert positions[0]["value"] == 5000.0
    assert positions[0]["shares"] == 1000.0
    assert positions[1]["cusip"] == "987654321"

def test_classify_delta():
    """Test position delta classification"""
    # New position
    assert classify_delta(None, 10000) == "bigmoney_hold_new"
    
    # Increase (>5%)
    assert classify_delta(10000, 12000) == "bigmoney_hold_increase"
    
    # Decrease (>5%)
    assert classify_delta(10000, 8000) == "bigmoney_hold_decrease"
    
    # Unchanged (within 5%)
    assert classify_delta(10000, 10200) == "bigmoney_hold"

@pytest.mark.asyncio
async def test_13f_etl_idempotency():
    """Test first run inserts, second run skips (idempotent)"""
    db = get_db()
    
    # Clear test data
    await db.signals.delete_many({"raw.manager": "Test Manager LLC"})
    
    # First run
    result1 = await run_13f_holdings_etl(
        "https://sec.gov/filing/test",
        SAMPLE_13F_XML,
        "Test Manager LLC",
        "2024-03-31"
    )
    
    assert result1["inserted"] == 2
    assert result1["skipped"] == 0
    
    # Second run (same data)
    result2 = await run_13f_holdings_etl(
        "https://sec.gov/filing/test",
        SAMPLE_13F_XML,
        "Test Manager LLC",
        "2024-03-31"
    )
    
    assert result2["inserted"] == 0
    assert result2["skipped"] == 2

@pytest.mark.asyncio
async def test_13f_signals_have_oa_citation():
    """Test all 13F signals include oa_citation"""
    db = get_db()
    
    # Clear and insert
    await db.signals.delete_many({"raw.manager": "Citation Test LLC"})
    
    await run_13f_holdings_etl(
        "https://sec.gov/filing/citation-test",
        SAMPLE_13F_XML,
        "Citation Test LLC",
        "2024-06-30"
    )
    
    # Check all have oa_citation
    signals = await db.signals.find({"raw.manager": "Citation Test LLC"}).to_list(None)
    
    assert len(signals) > 0
    for sig in signals:
        assert "oa_citation" in sig
        assert sig["oa_citation"]["url"] == "https://sec.gov/filing/citation-test"
        assert sig["oa_citation"]["source"] == "SEC 13F-HR: Citation Test LLC"

@pytest.mark.asyncio
async def test_13f_amendment_supersedes_original():
    """Test 13F-HR/A amendments supersede original filings"""
    from backend.etl.sec_13f_holdings import diagnose_13f_mappings
    db = get_db()
    
    # Clear test data
    await db.signals.delete_many({"raw.manager": "Amendment Test LLC"})
    
    # First filing (original)
    await run_13f_holdings_etl(
        "https://sec.gov/filing/0001234567-24-000001",
        SAMPLE_13F_XML,
        "Amendment Test LLC",
        "2024-03-31"
    )
    
    original_signals = await db.signals.find({"raw.manager": "Amendment Test LLC"}).to_list(None)
    assert len(original_signals) == 2
    assert all(not sig["raw"].get("superseded", False) for sig in original_signals)
    
    # Amendment filing (same period)
    await run_13f_holdings_etl(
        "https://sec.gov/filing/0001234567-24-000001/A",
        SAMPLE_13F_XML,
        "Amendment Test LLC",
        "2024-03-31"
    )
    
    # Check original signals are marked superseded
    superseded = await db.signals.find({
        "raw.manager": "Amendment Test LLC",
        "raw.superseded": True
    }).to_list(None)
    
    assert len(superseded) == 2
    
    # Check new signals are not superseded
    active = await db.signals.find({
        "raw.manager": "Amendment Test LLC",
        "raw.superseded": False
    }).to_list(None)
    
    assert len(active) == 2

@pytest.mark.asyncio
async def test_diagnose_13f_mappings():
    """Test diagnose endpoint returns unmapped CUSIPs"""
    from backend.etl.sec_13f_holdings import diagnose_13f_mappings
    db = get_db()
    
    # Clear and insert test data
    await db.signals.delete_many({"raw.manager": "Diagnose Test LLC"})
    
    result = await run_13f_holdings_etl(
        "https://sec.gov/filing/diagnose-test",
        SAMPLE_13F_XML,
        "Diagnose Test LLC",
        "2024-09-30"
    )
    
    # Run diagnostics
    diag = await diagnose_13f_mappings(limit=50)
    
    assert "total_signals_checked" in diag
    assert "status_counts" in diag
    assert "top_unmapped_cusips" in diag
    assert diag["total_signals_checked"] >= 0
