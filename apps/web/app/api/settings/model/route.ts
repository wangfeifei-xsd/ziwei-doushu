import { modelSettingsForPage, readAISettings, saveAISettings, clearAIKey } from '@/lib/ai/settings';
import { modelSettingsError, readModelSettingsRequest, assertSettingsOrigin } from '@/lib/ai/settings-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { config, source } = await readAISettings();
    return Response.json({ settings: modelSettingsForPage(config, source) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return modelSettingsError(error); }
}

export async function PUT(request: Request) {
  try {
    const settings = await saveAISettings(await readModelSettingsRequest(request));
    return Response.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return modelSettingsError(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSettingsOrigin(request);
    return Response.json({settings:await clearAIKey()},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return modelSettingsError(error); }
}
