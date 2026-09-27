// Downloads the browser-E2E fixture model (info.json + one Q4_K_M GGUF) into e2e/fixtures/models/<id>/.
// The model files are git-ignored. Run once: `node scripts/fetch-fixture-model.mjs`.
// The plan's candidate HuggingFaceTB/SmolLM2-135M-Instruct-GGUF does not exist on the Hub
// (401 on 2026-09-27); bartowski's quantisation of the same apache-2.0 model is used instead.
import { mkdir, writeFile } from 'node:fs/promises';

const ID = process.env.FIXTURE_MODEL ?? 'bartowski/SmolLM2-135M-Instruct-GGUF';
const res = await fetch(`https://huggingface.co/api/models/${ID}?blobs=true`);
if (!res.ok) throw new Error(`${ID}: Hub answered ${res.status}`);
const info = await res.json();
if (!['apache-2.0', 'mit'].includes(info.cardData?.license)) throw new Error(`${ID} licence ${info.cardData?.license} not permissive`);
const file = info.siblings.find((s) => /Q4_K_M\.gguf$/i.test(s.rfilename)) ?? info.siblings.find((s) => s.rfilename.endsWith('.gguf'));
const dir = `e2e/fixtures/models/${ID}`;
await mkdir(dir, { recursive: true });
info.siblings = [file];
await writeFile(`${dir}/info.json`, JSON.stringify(info));
const bytes = Buffer.from(await (await fetch(`https://huggingface.co/${ID}/resolve/${info.sha}/${file.rfilename}`)).arrayBuffer());
if (bytes.length !== file.size) throw new Error(`${file.rfilename}: got ${bytes.length} bytes, expected ${file.size}`);
await writeFile(`${dir}/${file.rfilename}`, bytes);
console.log(`fixture ${ID} ${file.rfilename} ${bytes.length} bytes (licence ${info.cardData.license})`);
