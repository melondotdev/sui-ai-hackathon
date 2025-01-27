import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WalletAnalysis {
    summary: string;
    commentary: string;
}

export default function WalletAnalysis() {
    const { walletAddress } = useParams();
    const [loading, setLoading] = useState(true);
    const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
    
    useEffect(() => {
        // TODO: Implement actual blockchain analysis
        const analyzeWallet = async () => {
            try {
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 2000));
                setAnalysis({
                    summary: "Sample analysis data",
                    commentary: "Bork's insights will appear here"
                });
            } catch (error) {
                console.error("Analysis failed:", error);
            } finally {
                setLoading(false);
            }
        };

        analyzeWallet();
    }, [walletAddress]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p className="text-lg">Analyzing wallet data...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Wallet Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Wallet: {walletAddress}
                        </p>
                        {analysis && (
                            <>
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Chain Analysis</h3>
                                    <p>{analysis.summary}</p>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Bork's Commentary</h3>
                                    <p>{analysis.commentary}</p>
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}