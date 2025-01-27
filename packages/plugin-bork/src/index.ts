import { Plugin } from "@elizaos/core";
import fetchWalletData from "./actions/fetchWalletData.ts";

export { fetchWalletData };

export const borkPlugin: Plugin = {
    name: "bork",
    description: "Bork roasts the on-chain activities of a wallet of your choice",
    actions: [fetchWalletData],
    evaluators: [],
    providers: [],
};

export default borkPlugin;
