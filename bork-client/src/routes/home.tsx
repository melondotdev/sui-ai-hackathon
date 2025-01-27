import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router";

export default function Home() {
    const [walletAddress, setWalletAddress] = useState("");
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (walletAddress.trim()) {
            navigate(`/analysis/${walletAddress}`);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center space-y-6">
                        <h1 className="text-4xl font-bold text-center">
                            get borked
                        </h1>
                        <p className="text-lg text-muted-foreground">
                            enter a sui wallet
                        </p>
                        <form onSubmit={handleSubmit} className="w-full space-y-4">
                            <Input
                                type="text"
                                value={walletAddress}
                                onChange={(e) => setWalletAddress(e.target.value)}
                                placeholder="Enter wallet address"
                                className="w-full"
                            />
                            <Button type="submit" className="w-full">
                                Analyze Wallet
                            </Button>
                        </form>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
