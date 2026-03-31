import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const Help = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Documentation"
        description="Understanding Insider Pulse's scoring and features"
      />

      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>Scoring System</CardTitle>
          <CardDescription>Transparent, exponential decay-based opportunity scoring</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>How are opportunity scores calculated?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground space-y-2">
                <p>
                  Insider Pulse uses a weighted scoring model with eight main components:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>PolicyMomentum (1.0):</strong> Regulatory & policy signals</li>
                  <li><strong>FlowPressure (1.0):</strong> ETF flows & volume anomalies</li>
                  <li><strong>BigMoneyConfirm (1.0):</strong> 13F filings & institutional activity</li>
                  <li><strong>InsiderPoliticianConfirm (0.8):</strong> Insider & politician trades</li>
                  <li><strong>Attention (0.5):</strong> Social media and news mentions</li>
                  <li><strong>TechEdge (0.4):</strong> Technical edge signals</li>
                  <li><strong>RiskFlags (-1.0):</strong> Negative risk indicators</li>
                  <li><strong>CapexMomentum (0.6):</strong> Capital expenditure momentum</li>
                </ul>
                <p className="mt-2">
                  Scores decay exponentially over time (30-day half-life) to prioritize recent signals.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>What are themes?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Themes are narrative clusters identified across multiple assets. They help you understand
                broader market movements and correlation patterns. Each theme aggregates signals from
                related opportunities to show sector-wide trends.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>What is the Backtest Engine?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                The Backtest Engine validates our scoring models against historical data. It shows how
                opportunities would have performed over specific time periods, including hit rates,
                average returns, and the most successful themes.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>How does ETL idempotency work?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Every data point ingested by Insider Pulse is assigned a deterministic checksum.
                This ensures that the same data is never processed twice, maintaining data integrity
                and preventing duplicate signals even if ETL jobs are re-run.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>Where can I buy these assets in Australia?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Each asset detail page includes AU-friendly exchange recommendations. We link to
                major Australian exchanges like CoinSpot, Binance AU, and Swyftx. Always conduct
                your own research before making investment decisions.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

    </div>
  );
};

export default Help;
