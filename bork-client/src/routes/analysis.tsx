import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "../lib/api";

interface WalletAnalysis {
  [key: string]: any;
}

export default function Analysis() {
  const { walletAddress } = useParams();

  // Prevent multiple fetches per wallet address
  const [hasFetched, setHasFetched] = useState(false);

  // Bork’s introduction text from the first response
  const [borkIntro, setBorkIntro] = useState<string>("");

  // The full analysis from the first call
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);

  // The roast from the second call
  const [roastResponse, setRoastResponse] = useState<any>(null);

  // Loading / error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------
  // 1) FIRST EFFECT:
  // Fetch the wallet data (and Bork intro) exactly once.
  // ---------------------------
  useEffect(() => {
    // If there's no walletAddress, or we've already fetched, do nothing.
    if (!walletAddress || hasFetched) return;

    setHasFetched(true);  // Mark that we've started a fetch
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // 1) FIRST CALL: fetch wallet data & Bork’s intro
        const response = await apiClient.sendMessage(
          "7e8bb798-a9e2-03e2-86aa-e0f9a8ae5baf",
          `fetch wallet data from ${walletAddress}`
        );

        // Extract Bork’s intro text
        if (Array.isArray(response) && response[0]?.text) {
          setBorkIntro(response[0].text);
        }

        setAnalysis(response);
      } catch (err: any) {
        console.error("Analysis failed:", err);
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [walletAddress, hasFetched]);

  // ---------------------------
  // 2) SECOND EFFECT:
  // Run the "roast" call only after we have an `analysis`.
  // ---------------------------
  useEffect(() => {
    // If analysis is null, we haven't fetched anything yet
    // or we had an error. Also skip if there's no walletAddress.
    if (!analysis || !walletAddress) return;

    // Optionally setLoading(true) again if you want a spinner during the roast fetch:
    // setLoading(true);

    (async () => {
      try {
        const roast = await apiClient.sendMessage(
          "7e8bb798-a9e2-03e2-86aa-e0f9a8ae5baf",
          `post a detailed summary of the wallet data and roast the owner of this wallet in comedic style.\n\n${JSON.stringify(
            analysis,
            null,
            2
          )}`
        );
        setRoastResponse(roast);
      } catch (err: any) {
        console.error("Roast failed:", err);
        setError(err.message || "Unknown error");
      } finally {
        // setLoading(false);
      }
    })();
  }, [analysis, walletAddress]);

  // Error UI
  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Wallet Analysis Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">Failed: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading UI: If you prefer to show loading only for the first call,
  // keep it simple:
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        {borkIntro && (
          <p className="text-xl text-center max-w-xl">
            {borkIntro} <span className="animate-pulse">...</span>
          </p>
        )}
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p className="text-lg">Analyzing wallet data...</p>
        </div>
      </div>
    );
  }

  // Main UI once we have data
  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Wallet Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Wallet: {walletAddress}</p>
        </CardContent>
      </Card>

      {/* Bork’s Roast */}
      {roastResponse && (
        <Card>
          <CardHeader>
            <CardTitle>Bork’s Roast</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-neutral-800 p-4 rounded text-sm text-wrap">
              {Array.isArray(roastResponse) && roastResponse.length > 0
                ? roastResponse[0].text
                : "No roast text found"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
