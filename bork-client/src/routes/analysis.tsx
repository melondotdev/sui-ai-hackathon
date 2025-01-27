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

  // Bork’s introduction from the first response
  const [borkIntro, setBorkIntro] = useState("");

  // The full analysis from the first call
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);

  // The roast from the second call (triggered by a button)
  const [roastResponse, setRoastResponse] = useState<any>(null);

  // Loading / error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------
  // 1) FIRST EFFECT: FETCH DATA
  // ---------------------------
  useEffect(() => {
    if (!walletAddress || hasFetched) return;

    setHasFetched(true);
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // First API call: fetch wallet data & Bork intro
        const response = await apiClient.sendMessage(
          "7e8bb798-a9e2-03e2-86aa-e0f9a8ae5baf",
          `fetch wallet data from ${walletAddress}`
        );

        // Extract Bork’s intro text if available
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
  // 2) SECOND API CALL: ON BUTTON CLICK
  // ---------------------------
  async function handleRoastClick() {
    try {
      setLoading(true);
      setError(null);

      const roast = await apiClient.sendMessage(
        "7e8bb798-a9e2-03e2-86aa-e0f9a8ae5baf",
        `post a detailed summary of the wallet data and roast the owner in comedic style.\n\n${JSON.stringify(
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
      setLoading(false);
    }
  }

  // ERROR UI
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

  // LOADING UI
  if (loading && !analysis) {
    // Show spinner only while fetching the first call (no analysis yet)
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

  // MAIN UI (once the first data is loaded)
  return (
    <div className="container mx-auto p-4 space-y-4">

      {/* Wallet Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Wallet: {walletAddress}
          </p>

          {/* If the first response had a Bork intro, display it */}
          {borkIntro && (
            <div className="mt-4">
              <p className="font-semibold">Bork Intro</p>
              <p>{borkIntro}</p>
            </div>
          )}

          {/* If we have analysis, show a button to “Roast” */}
          {analysis && !roastResponse && (
            <button
              onClick={handleRoastClick}
              className="mt-6 inline-flex items-center px-4 py-2 text-sm font-medium rounded bg-orange-600 hover:bg-orange-700 text-white"
            >
              Roast the Owner
            </button>
          )}
        </CardContent>
      </Card>

      {/* Optionally show a spinner while the roast is happening */}
      {loading && analysis && !roastResponse && (
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p className="text-lg">Cooking up a roast...</p>
        </div>
      )}

      {/* If we have a roast, show it */}
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
