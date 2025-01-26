import { Plugin } from "@elizaos/core";
import fetchWalletData from "./actions/fetchWalletData.ts";
import analyzeWalletBehaviour from "./actions/analyzeWalletBehaviour.ts";

export { fetchWalletData, analyzeWalletBehaviour };

export const borkPlugin: Plugin = {
    name: "bork",
    description: "Bork roasts the on-chain activities of a wallet of your choice",
    actions: [fetchWalletData, analyzeWalletBehaviour],
    evaluators: [],
    providers: [],
};

export default borkPlugin;
