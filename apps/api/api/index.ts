import { createApp } from "../src/app.js"

/**
 * Vercel serverless entry point. Vercel's Node runtime hands this module a
 * standard (req, res) pair per invocation — Express's `app` is itself a
 * valid (req, res) => void handler, so no adapter library is needed.
 * vercel.json rewrites every path to this function.
 */
const app = createApp()

export default app
