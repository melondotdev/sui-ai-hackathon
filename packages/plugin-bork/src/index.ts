import { Plugin } from "@elizaos/core";
import getAccountActivity from "./actions/getAccountActivity.ts";
import getAccountBalance from "./actions/getAccountBalance.ts";
import getNftsByWallet from "./actions/getNftsByWallet.ts";
import { KioskProvider, kioskProvider } from "./providers/kiosk.ts";

export { KioskProvider, getAccountActivity, getAccountBalance, getNftsByWallet };

export const borkPlugin: Plugin = {
    name: "bork",
    description: "Bork roasts the on-chain activities of a wallet of your choice",
    actions: [getAccountActivity, getAccountBalance, getNftsByWallet],
    evaluators: [],
    providers: [kioskProvider],
};

export default borkPlugin;
