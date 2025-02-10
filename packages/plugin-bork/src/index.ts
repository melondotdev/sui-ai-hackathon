import { Plugin } from "@elizaos/core";
import getAccountActivity from "./actions/getAccountActivity.ts";
import getAccountBalance from "./actions/getAccountBalance.ts";
import getNftsByWallet from "./actions/getNftsByWallet.ts";
import getDexData from "./actions/getProtocolData.ts";
import { kioskProvider } from "./providers/kiosk.ts";

export * as actions from "./actions";
// export * as evaluators from "./evaluators";
export * as providers from "./providers";

export const borkPlugin: Plugin = {
    name: "bork",
    description: "Bork roasts the on-chain activities of a wallet of your choice",
    actions: [getAccountActivity, getAccountBalance, getNftsByWallet, getDexData],
    evaluators: [],
    providers: [kioskProvider],
};

export default borkPlugin;
