import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const shimCandidates = [
	resolve("node_modules/tieba.js/dist/shims/undici.js"),
	resolve("../../packages/sdk/dist/shims/undici.js"),
];

const undiciShim = shimCandidates.find((path) => existsSync(path));

if (!undiciShim) {
	throw new Error(
		`Cannot find tieba.js undici shim. Checked: ${shimCandidates.join(", ")}`,
	);
}

rmSync("out-worker", { recursive: true, force: true });

await build({
	entryPoints: ["src/worker.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	outfile: "out-worker/worker.js",
	plugins: [
		{
			name: "tieba-undici-shim",
			setup(builder) {
				builder.onResolve({ filter: /^undici$/ }, () => ({ path: undiciShim }));
			},
		},
		{
			// Workers 上没有 pg 需要的 net/tls 组合，且 pg 在模块初始化时就会
			// require("events")，导致整包加载失败。这里换成惰性抛错的桩：
			// 不碰数据库的接口照常工作，DB 相关接口在调用时给出明确提示。
			name: "pg-unavailable",
			setup(builder) {
				builder.onResolve({ filter: /^(pg|pg-native)$/ }, () => ({
					path: "pg-unavailable",
					namespace: "pg-unavailable",
				}));
				builder.onLoad(
					{ filter: /.*/, namespace: "pg-unavailable" },
					() => ({
						contents: `export class Pool {
	constructor() {
		throw new Error(
			"此部署未连接 Postgres：DATABASE_URL 未配置，数据库相关接口不可用",
		);
	}
}
export default { Pool };
`,
						loader: "js",
					}),
				);
			},
		},
	],
});
