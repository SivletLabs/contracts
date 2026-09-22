import fs from "fs";
import path from "solc";
// @ts-ignore
import solc from "solc";

const contracts = ["BuybackBurnEngine.sol", "SivletToken.sol"];
const sources: Record<string, { content: string }> = {};

for (const name of contracts) {
  const filePath = `/Users/echo/project/SivletLabs/contracts/${name}`;
  sources[name] = {
    content: fs.readFileSync(filePath, "utf8")
  };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"]
      }
    },
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};

console.log("Compiling contracts...");
const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasErrors = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error("COMPILE ERROR:", err.formattedMessage);
      hasErrors = true;
    } else {
      console.warn("WARNING:", err.formattedMessage);
    }
  }
}

if (!hasErrors) {
  console.log("✅ All contracts compiled successfully!");
  for (const file in output.contracts) {
    for (const contract in output.contracts[file]) {
      const bytecodeSize = output.contracts[file][contract].evm.bytecode.object.length / 2;
      console.log(` - ${contract}: ${bytecodeSize} bytes bytecode`);
    }
  }
} else {
  process.exit(1);
}
