import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const Help = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Documentation"
        description="Understanding Opportunity Radar's scoring and features"
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
                  Opportunity Radar uses a weighted scoring model with four main components:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Momentum (35%):</strong> Price action and trend strength</li>
                  <li><strong>Sentiment (25%):</strong> Social media and news sentiment analysis</li>
                  <li><strong>Volume (25%):</strong> Trading volume patterns and anomalies</li>
                  <li><strong>Technical (15%):</strong> Chart patterns and indicators</li>
                </ul>
                <p className="mt-2">
                  Scores decay exponentially over time to prioritize recent signals.
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
                Every data point ingested by Opportunity Radar is assigned a deterministic checksum.
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

      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>Available endpoints for the backend API</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { method: "GET", path: "/api/healthz/weights", desc: "Scoring component weights" },
              { method: "GET", path: "/api/opportunities", desc: "List all opportunities" },
              { method: "GET", path: "/api/opportunities/:id", desc: "Get opportunity details" },
              { method: "GET", path: "/api/alerts", desc: "List alerts" },
              { method: "POST", path: "/api/backtest", desc: "Run backtest analysis" },
              { method: "GET", path: "/api/watchlist", desc: "Get watchlist items" },
              { method: "POST", path: "/api/watchlist", desc: "Add to watchlist" },
              { method: "GET", path: "/api/themes", desc: "List active themes" },
              { method: "GET", path: "/api/export", desc: "Export data (CSV/Parquet)" },
            ].map((endpoint) => (
              <div key={endpoint.path} className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border">
                <Badge variant={endpoint.method === "GET" ? "secondary" : "outline"}>
                  {endpoint.method}
                </Badge>
                <code className="flex-1 text-sm font-mono text-primary">{endpoint.path}</code>
                <span className="text-sm text-muted-foreground">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Help;
