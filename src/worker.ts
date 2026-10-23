import { createApp } from "./app.ts";
import { setupClient } from "./lib/sdk.ts";

type WorkerEnv = {
	BDUSS: string;
	DB_ANALYZE_PASSWORD?: string;
};

const app = createApp({ cacheRuntime: "worker" });

export default {
	fetch(request: Request, env: WorkerEnv) {
		// 没配 BDUSS 时不要让整个 Worker 崩成 1101：健康检查照常，业务接口给出明确提示。
		if (!env.BDUSS) {
			const { pathname } = new URL(request.url);
			if (pathname === "/health") {
				return app.fetch(request, env);
			}
			return Response.json(
				{ error: "bduss_missing", message: "BDUSS 环境变量未设置" },
				{ status: 503 },
			);
		}
		// Worker 场景下从环境变量注入 BDUSS。
		setupClient(env.BDUSS);
		return app.fetch(request, env);
	},
};
