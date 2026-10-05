import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40) || "diagram";
}

function cleanDiagramCode(code: string): string {
	let trimmed = code.trim();
	if (trimmed.startsWith("```")) {
		const lines = trimmed.split("\n");
		if (lines[0].startsWith("```")) lines.shift();
		if (lines.length > 0 && lines[lines.length - 1].trim() === "```") lines.pop();
		trimmed = lines.join("\n").trim();
	}
	return trimmed;
}

const DrawDiagramParams = Type.Object({
	type: Type.Optional(
		Type.Union([Type.Literal("mermaid"), Type.Literal("svg"), Type.Literal("python")], {
			description: "Diagram type: 'mermaid' (flowcharts, sequence, states), 'svg' (geometry, custom layout), or 'python' (matplotlib/numpy plots and math curves, if available). Defaults to 'mermaid'.",
		}),
	),
	caption: Type.String({
		description: "Short descriptive title of the diagram (e.g. 'TCP 3-Way Handshake', 'Memory Layout: Stack vs Heap').",
	}),
	code: Type.String({
		description: "The diagram code: valid Mermaid syntax, SVG markup, or Python matplotlib script.",
	}),
	filename: Type.Optional(
		Type.String({
			description: "Optional custom filename slug without extension (e.g. 'tcp-handshake'). Defaults to slugified caption.",
		}),
	),
});

export default function drawDiagram(pi: ExtensionAPI) {
	pi.registerTool({
		name: "draw_diagram",
		label: "draw_diagram",
		description:
			"Draw a visual diagram (Mermaid or SVG) and snap it directly into the student's lesson and Obsidian .md log file. Use this instead of terminal ASCII art whenever a concept has structure, flow, hierarchy, states, or geometry. Obsidian renders Mermaid and SVG interactively.",
		promptSnippet:
			"Use draw_diagram to create a visual diagram (Mermaid or SVG) that snaps directly into the student's Obsidian note.",
		promptGuidelines: [
			"Never draw ASCII art or text diagrams in regular messages. Use draw_diagram instead.",
			"Use type: 'mermaid' for relationships, workflows, dependencies, sequence diagrams, state machines, class diagrams, mindmaps.",
			"Use type: 'svg' for spatial/geometric visuals, coordinate axes, plots, and custom shapes.",
			"Use type: 'python' for mathematical functions, statistical distributions, neural net curves, or data plots using matplotlib/numpy.",
			"Provide a concise caption explaining what the diagram demonstrates.",
		],
		parameters: DrawDiagramParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const type = params.type || "mermaid";
			const caption = params.caption.trim();
			const code = cleanDiagramCode(params.code);

			if (type === "python") {
				const ext = "png";
				const baseSlug = params.filename ? slugify(params.filename) : slugify(caption);
				const timestamp = Date.now().toString().slice(-6);
				const filename = "viz-" + baseSlug + "-" + timestamp + "." + ext;
				const scriptName = "viz-" + baseSlug + "-" + timestamp + ".py";
				const vizDir = path.resolve(ctx.cwd, "viz");

				try {
					if (!fs.existsSync(vizDir)) {
						fs.mkdirSync(vizDir, { recursive: true });
					}
				} catch (_e) {
					// ignore
				}

				const imagePath = path.join(vizDir, filename);
				const scriptPath = path.join(vizDir, scriptName);

				const pyWrapper = [
					"import os, sys",
					"OUTPUT_PATH = r\"" + imagePath + "\"",
					"try:",
					"    import matplotlib",
					"    matplotlib.use('Agg')",
					"    import matplotlib.pyplot as plt",
					"    plt.show = lambda *args, **kwargs: None",
					"except ImportError:",
					"    pass",
					"",
					"# --- User Script ---",
					code,
					"",
					"# --- Auto-Save Figure ---",
					"try:",
					"    import matplotlib.pyplot as plt",
					"    if plt.get_fignums():",
					"        plt.savefig(OUTPUT_PATH, bbox_inches='tight', dpi=150)",
					"        plt.close('all')",
					"except Exception as e:",
					"    sys.stderr.write(f'Auto-save error: {e}\\n')",
				].join("\n");

				try {
					fs.writeFileSync(scriptPath, pyWrapper, "utf-8");
				} catch (err: any) {
					return {
						content: [{ type: "text" as const, text: "Failed to write python script: " + err.message }],
						details: { type, caption, status: "error", error: err.message },
					};
				}

				let executionError: string | null = null;
				try {
					let res: any;
					if (typeof pi.exec === "function") {
						res = await pi.exec("python", [scriptPath], { cwd: ctx.cwd });
					} else {
						const { execFile } = await import("node:child_process");
						const { promisify } = await import("node:util");
						res = await promisify(execFile)("python", [scriptPath], { cwd: ctx.cwd, timeout: 30000 });
					}
					if (res && typeof res.exitCode === "number" && res.exitCode !== 0) {
						executionError = res.stderr || res.stdout || ("Exited with code " + res.exitCode);
					}
				} catch (err: any) {
					executionError = err.message || String(err);
				}

				if (executionError || !fs.existsSync(imagePath)) {
					const reason = executionError
						? "Python execution failed: " + executionError
						: "Python script did not produce an image. Ensure matplotlib/numpy is installed.";
					return {
						content: [{ type: "text" as const, text: reason + "\nFalling back to Mermaid / SVG." }],
						details: { type, caption, code, status: "error", error: reason },
					};
				}

				const embedMarkdown = "\n![[" + filename + "]]\n";
				const responseText = "Python plot rendered and snapped to lesson:\nCaption: " + caption + "\nSaved to: viz/" + filename + embedMarkdown;
				return {
					content: [{ type: "text" as const, text: responseText }],
					details: {
						type,
						caption,
						code,
						filename,
						status: "ok",
					},
				};
			}

			const ext = type === "mermaid" ? "mmd" : "svg";
			const baseSlug = params.filename ? slugify(params.filename) : slugify(caption);
			const timestamp = Date.now().toString().slice(-6);
			const filename = `viz-${baseSlug}-${timestamp}.${ext}`;

			const vizDir = path.resolve(ctx.cwd, "viz");
			try {
				if (!fs.existsSync(vizDir)) {
					fs.mkdirSync(vizDir, { recursive: true });
				}
				const filePath = path.join(vizDir, filename);
				fs.writeFileSync(filePath, code, "utf-8");
			} catch (_e) {
				// ignore
			}

			const embedMarkdown = type === "mermaid"
				? "\n```mermaid\n" + code + "\n```\n"
				: "\n![[" + filename + "]]\n";

			const responseText = `Diagram created and snapped to lesson:\nCaption: ${caption}\nFile: viz/${filename}${embedMarkdown}`;

			return {
				content: [{ type: "text" as const, text: responseText }],
				details: {
					type,
					caption,
					code,
					filename,
					status: "ok",
				},
			};
		},

		renderCall(args, theme) {
			const type = args.type || "mermaid";
			const caption = args.caption || "Diagram";
			const text = theme.fg("toolTitle", theme.bold("draw_diagram ")) +
				theme.fg("accent", `[${type}] `) +
				theme.fg("muted", caption);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			const lines = [
				theme.fg("success", "✓ ") + theme.fg("accent", `Diagram snapped to note: ${details.caption}`),
				theme.fg("dim", `  Type: ${details.type} · Saved to: viz/${details.filename}`),
			];
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
