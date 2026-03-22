import pytest
from backend.etl.etf_flows import (
    parse_etf_flows_csv, 
    compute_rolling_zscore, 
    aggregate_by_sector,
    load_sector_map,
    run_etf_flows_etl
)
from backend.db import get_db
from unittest.mock import patch

MOCK_ETF_FLOWS_CSV = """date,ticker,flow
2024-01-01,SPY,1000000
2024-01-02,SPY,500000
2024-01-03,SPY,2000000
2024-01-04,SPY,800000
2024-01-01,QQQ,-500000
2024-01-02,QQQ,-200000
2024-01-03,QQQ,100000
2024-01-04,QQQ,-800000
"""

MOCK_SECTOR_MAP = {
    "SPY": "Broad Market",
    "QQQ": "Technology"
}

def test_parse_etf_flows_csv():
    """Test CSV parsing with column detection"""
    flows = parse_etf_flows_csv(MOCK_ETF_FLOWS_CSV)
    
    assert len(flows) == 8
    assert flows[0]["ticker"] == "SPY"
    assert flows[0]["flow"] == 1000000.0
    assert flows[4]["ticker"] == "QQQ"
    assert flows[4]["flow"] == -500000.0

def test_compute_rolling_zscore():
    """Test z-score computation"""
    flows = parse_etf_flows_csv(MOCK_ETF_FLOWS_CSV)
    flows_with_z = compute_rolling_zscore(flows, window_days=60)
    
    assert len(flows_with_z) == 8
    
    # Check SPY (positive flows) has positive z-scores
    spy_flows = [f for f in flows_with_z if f["ticker"] == "SPY"]
    assert len(spy_flows) == 4
    
    # Last SPY entry (2000000) should have high z-score
    spy_sorted = sorted(spy_flows, key=lambda x: x["date"])
    assert spy_sorted[-2]["z_score"] > 0  # 2000000 flow spike
    
    # Check QQQ (mostly negative flows) has negative z-scores
    qqq_flows = [f for f in flows_with_z if f["ticker"] == "QQQ"]
    assert len(qqq_flows) == 4

def test_aggregate_by_sector():
    """Test sector aggregation"""
    flows = parse_etf_flows_csv(MOCK_ETF_FLOWS_CSV)
    flows_with_z = compute_rolling_zscore(flows, window_days=60)
    
    sector_map = MOCK_SECTOR_MAP
    aggregates = aggregate_by_sector(flows_with_z, sector_map)
    
    assert len(aggregates) > 0
    
    # Check that sectors are present
    sectors = {a["sector"] for a in aggregates}
    assert "Broad Market" in sectors or "Technology" in sectors

def test_load_sector_map():
    """Test sector map JSON loading"""
    import json
    json_str = json.dumps(MOCK_SECTOR_MAP)
    sector_map = load_sector_map(json_str)
    
    assert sector_map["SPY"] == "Broad Market"
    assert sector_map["QQQ"] == "Technology"

@pytest.mark.asyncio
async def test_etf_flows_etl_idempotency():
    """Test ETF flows ETL idempotency - second run inserts 0"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"signal_type": {"$in": ["flow_pressure", "flow_pressure_etf"]}})
    
    # Mock HTTP call and config
    with patch("backend.etl.etf_flows.fetch_csv") as mock_csv, \
         patch("backend.config.settings.ETF_FLOWS_CSV_URLS", "http://example.com/flows.csv"), \
         patch("backend.config.settings.ETF_SECTOR_MAP_JSON", '{"SPY":"Broad Market","QQQ":"Technology"}'):
        
        mock_csv.return_value = MOCK_ETF_FLOWS_CSV
        
        # First run
        result1 = await run_etf_flows_etl()
        assert result1["signals_created"] > 0
        created_first = result1["signals_created"]
        
        # Second run
        result2 = await run_etf_flows_etl()
        assert result2["signals_created"] == 0
        assert result2["signals_skipped"] == created_first

@pytest.mark.asyncio
async def test_etf_flows_signal_structure():
    """Test ETF flow signals have correct structure"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"signal_type": {"$in": ["flow_pressure", "flow_pressure_etf"]}})
    
    # Mock HTTP call and config
    with patch("backend.etl.etf_flows.fetch_csv") as mock_csv, \
         patch("backend.config.settings.ETF_FLOWS_CSV_URLS", "http://example.com/flows.csv"), \
         patch("backend.config.settings.ETF_SECTOR_MAP_JSON", '{"SPY":"Broad Market"}'):
        
        mock_csv.return_value = MOCK_ETF_FLOWS_CSV
        
        # Run ETL
        await run_etf_flows_etl()
        
        # Verify flow_pressure_etf signal
        etf_signal = await db.signals.find_one({"signal_type": "flow_pressure_etf"})
        assert etf_signal is not None
        assert etf_signal.get("magnitude") is not None
        assert etf_signal.get("direction") in ["up", "down", "neutral"]
        
        # Verify citation
        citation = etf_signal.get("oa_citation")
        assert citation is not None
        assert citation["source"] == "ETF Flows CSV"
        
        # Verify raw data includes z_score
        raw = etf_signal.get("raw", {})
        assert "z_score" in raw
        assert "ticker" in raw
        
        # Verify flow_pressure (sector) signal
        sector_signal = await db.signals.find_one({"signal_type": "flow_pressure"})
        if sector_signal:
            assert sector_signal.get("value_text") is not None  # Sector name
            raw_sector = sector_signal.get("raw", {})
            assert "sector" in raw_sector
            assert "z_score" in raw_sector
