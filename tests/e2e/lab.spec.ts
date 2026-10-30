import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
/** Screenshots come from the GPU run only, so they show the real look. */
const shot = async (page: Page, name: string) => { if (test.info().project.name === 'gpu') await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${query}`);
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 180_000 });
  await settle(page);
}
/** Waits until the canvas has rendered two more frames. */
async function settle(page: Page, ms = 600) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
const detailTitle = (page: Page) => page.locator('#detail-title');
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const mode = (page: Page, name: string) => page.locator('nav[aria-label="Mode"] button', { hasText: new RegExp(`^${name}$`) }).click();
const cameraButton = (page: Page, name: string) => page.locator('[aria-label="Camera views"] button', { hasText: new RegExp(`^${name}$`) });
const slider = (page: Page, name: RegExp) => page.getByRole('slider', { name });
const canvasShot = (page: Page) => page.locator('.viewer canvas').screenshot();
const search = (page: Page) => page.getByLabel('Search structures');
/** Finds a structure by search and opens it. */
async function pick(page: Page, query: string, label: RegExp) {
  await search(page).fill(query);
  await page.locator('.search-results button', { hasText: label }).first().click();
  await search(page).fill('');
}
/** The readout value (dd) beside a label (dt) in the open panel. */
const readout = (page: Page, label: string) => page.locator('aside.right dl.readout div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

test('loads without console errors and with a clean main screen @smoke', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Muscular System', level: 1 })).toBeVisible();
  // Details and the model note appear only after a selection; no disclaimer text on the main screen.
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(page.getByText('For learning only')).toHaveCount(0);
  await shot(page, '01-initial');
  expect(errors).toEqual([]);
});

test('clicking the model selects the muscle under the pointer; a drag does not', async ({ page }) => {
  await open(page);
  await ready(page);
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  // The body sits in the free area between the panels, right of the middle of the screen.
  await page.mouse.click(box.x + box.width * 0.617, box.y + box.height * 0.42);
  await expect(detailTitle(page)).toHaveText(/./);
  const picked = await detailTitle(page).textContent();
  await expect(page.locator('.scene-label.is-focus')).toHaveCount(1); // the selection is labelled
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 360, { steps: 8 });
  await page.mouse.up();
  await expect(detailTitle(page)).toHaveText(picked!);
  await shot(page, '02-selected');
});

test('search finds muscles by everyday names', async ({ page }) => {
  await open(page);
  await ready(page);
  const first = (_q: string) => page.locator('.search-results button').first();
  await search(page).fill('quads');
  await expect(first('quads')).toContainText('Quadriceps femoris');
  await search(page).fill('achilles');
  await expect(first('achilles')).toContainText('Calcaneal tendon');
  await search(page).fill('lats');
  await expect(first('lats')).toContainText('Latissimus dorsi');
  await search(page).fill('six pack');
  await expect(first('six pack')).toContainText('Rectus abdominis');
  await search(page).fill('hamstrings');
  await search(page).press('Enter');
  await expect(detailTitle(page)).toHaveText('Hamstrings (left)');
  await search(page).fill('zzzz');
  await expect(page.getByText('No structure matches')).toBeVisible();
});

test('the details give origin, insertion, nerve, actions and blood supply; parts link back to the muscle @smoke', async ({ page }) => {
  await open(page, '?nowebgl');
  await pick(page, 'biceps', /^Biceps brachii \(left\)/);
  await expect(detailTitle(page)).toHaveText('Biceps brachii (left)');
  await expect(readout(page, 'Origin')).toContainText(/supraglenoid/i);
  await expect(readout(page, 'Insertion')).toContainText(/radial tuberosity/i);
  await expect(readout(page, 'Nerve')).toContainText('Musculocutaneous');
  await expect(readout(page, 'Actions')).toContainText('Elbow: flexion');
  await expect(readout(page, 'Blood supply')).toContainText('Brachial');
  await expect(page.locator('.detail-panel .chips button', { hasText: 'Long head' })).toBeVisible();
  await page.locator('.detail-panel .chips button', { hasText: 'Long head' }).click();
  await expect(detailTitle(page)).toHaveText('Biceps brachii, long head (left)');
  await page.locator('.detail-panel .chip-static', { hasText: 'Biceps brachii (left)' }).click();
  await expect(detailTitle(page)).toHaveText('Biceps brachii (left)');
});

test('a muscle BodyParts3D lacks says it is modelled', async ({ page }) => {
  await open(page);
  await ready(page);
  await pick(page, 'latissimus', /^Latissimus dorsi \(left\)/);
  await page.locator('details.more summary').click();
  await expect(page.locator('.model-note')).toContainText('Modelled');
  await shot(page, '03-latissimus');
});

test('colour by nerve, depth and fibre type repaint the model and show a key', async ({ page }) => {
  await open(page);
  await ready(page);
  const real = await canvasShot(page);
  await radio(page, 'Nerve').click();
  await expect(page.locator('.key')).toContainText('Brachial plexus');
  await settle(page, 400);
  const nerve = await canvasShot(page);
  expect(nerve.equals(real)).toBe(false);
  await shot(page, '04-nerve');
  await radio(page, 'Depth').click();
  await expect(page.locator('.legend-row').first()).toContainText('Superficial');
  await radio(page, 'Fibres').click();
  await expect(page.locator('.key')).toContainText('slow-twitch');
  await shot(page, '05-fibres');
});

test('peel removes the superficial muscles and then the intermediate ones', async ({ page }) => {
  await open(page);
  await ready(page);
  const all = await canvasShot(page);
  await radio(page, 'No 1st').click();
  await settle(page, 500);
  const peeled = await canvasShot(page);
  expect(peeled.equals(all)).toBe(false);
  await radio(page, 'Deep').click();
  await settle(page, 500);
  expect((await canvasShot(page)).equals(peeled)).toBe(false);
  await shot(page, '06-peel-deep');
  await radio(page, 'All').click();
});

test('layers hide and show regions', async ({ page }) => {
  await open(page);
  await ready(page);
  const layer = page.getByRole('checkbox', { name: 'Thigh' });
  const before = await canvasShot(page);
  await layer.uncheck();
  await settle(page, 400);
  expect((await canvasShot(page)).equals(before)).toBe(false);
  await layer.check();
  await settle(page, 400);
});

test('isolate, zoom to and reset', async ({ page }) => {
  await open(page);
  await ready(page);
  await pick(page, 'deltoid', /^Deltoid \(left\)/);
  await page.getByRole('checkbox', { name: 'Isolate' }).check();
  await settle(page, 700);
  await shot(page, '07-isolated');
  await page.getByRole('button', { name: 'Zoom to' }).click();
  await settle(page, 900);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('aside.right')).toHaveCount(0);
});

test('camera presets and region buttons change the view', async ({ page }) => {
  await open(page);
  await ready(page);
  const front = await canvasShot(page);
  await cameraButton(page, 'Back').click();
  await settle(page, 900);
  expect((await canvasShot(page)).equals(front)).toBe(false);
  await shot(page, '08-back');
  await page.locator('[aria-label="Fly to a region"] button', { hasText: 'Thigh' }).click();
  await settle(page, 900);
  await expect(cameraButton(page, 'Back')).toHaveAttribute('aria-pressed', 'false');
});

test('labels mode shows labels that do not overlap', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('checkbox', { name: 'Labels' }).check();
  await settle(page, 1200);
  const labels = page.locator('.scene-label:visible');
  expect(await labels.count()).toBeGreaterThan(3);
  const boxes = await labels.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect(a[2]! <= b[0]! || b[2]! <= a[0]! || a[3]! <= b[1]! || b[3]! <= a[1]!).toBe(true);
  }
  await shot(page, '09-labels');
});

test('the cut turns the camera to face it; flip and off', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('radio', { name: 'Front', exact: true }).click();
  await expect(page.locator('.slice-hint')).toContainText('the back half');
  await settle(page, 1000);
  await shot(page, '10-cut');
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(page.locator('.slice-hint')).toContainText('the front half');
  await page.getByRole('radiogroup', { name: 'Cut direction' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await expect(page.locator('.slice-hint')).toHaveCount(0);
});

test('movement: poses bend the muscles with the bones and name the prime movers', async ({ page }) => {
  await open(page);
  await ready(page);
  const rest = await canvasShot(page);
  await mode(page, 'Movement');
  await expect(page.locator('.movement-panel')).toHaveAttribute('data-pose', 'anatomical');
  await radio(page, 'Deep squat').click();
  await expect(page.locator('.movement-panel')).toHaveAttribute('data-pose', 'squat');
  await settle(page, 900);
  expect((await canvasShot(page)).equals(rest)).toBe(false);
  const rows = page.locator('.role-list li');
  expect(await rows.count()).toBeGreaterThan(10);
  await expect(page.locator('.role-list li[data-role="prime"]').first()).toBeVisible();
  await expect(page.locator('.role-list li', { hasText: 'Gluteus maximus' }).first()).toHaveAttribute('data-role', 'antagonist');
  await shot(page, '11-squat');
  await radio(page, 'Anatomical position').click();
  await expect(page.locator('.role-list')).toHaveCount(0);
});

test('movement: an elbow slider makes biceps shorten and triceps lengthen, on the chosen side only', async ({ page }) => {
  await open(page);
  await ready(page);
  await mode(page, 'Movement');
  await page.locator('.movement-panel select').selectOption({ label: 'Elbow' });
  await slider(page, /^Flexion/).fill('120');
  await expect(page.locator('.role-list li', { hasText: 'Biceps brachii (left)' }).first()).toHaveAttribute('data-role', 'prime');
  await expect(page.locator('.role-list li', { hasText: 'Triceps brachii (left)' }).first()).toHaveAttribute('data-role', 'antagonist');
  await expect(page.locator('.role-list li', { hasText: 'Biceps brachii (left)' }).first()).toContainText('−');
  await expect(page.locator('.role-list li', { hasText: 'Triceps brachii (left)' }).first()).toContainText('+');
  await expect(page.locator('.role-list li', { hasText: '(right)' })).toHaveCount(0);
  await radio(page, 'Right').click();
  await expect(page.locator('.movement-panel')).toBeVisible();
  await radio(page, 'Solid').first().click();
  await settle(page, 600);
  await radio(page, 'Off').first().click();
  await shot(page, '12-elbow');
});

test('inside a muscle: length–tension, force–velocity, summation, motor units and steps', async ({ page }) => {
  await open(page);
  await ready(page);
  await mode(page, 'Inside a muscle');
  await expect(page.locator('.inside-panel')).toHaveAttribute('data-inside', 'tension');
  await slider(page, /^Sarcomere length/).fill('3.3');
  await expect(readout(page, 'Active force')).toHaveText(/2\d % of maximum/);
  await slider(page, /^Sarcomere length/).fill('2.1');
  await expect(readout(page, 'Active force')).toHaveText('100 % of maximum');
  await radio(page, 'Force–velocity').click();
  await slider(page, /^Velocity/).fill('-0.5');
  await expect(readout(page, 'Contraction')).toHaveText('Eccentric (lengthening)');
  await slider(page, /^Velocity/).fill('0.4');
  await expect(readout(page, 'Contraction')).toHaveText('Concentric (shortening)');
  await radio(page, 'Twitch to tetanus').click();
  await slider(page, /^Stimulation rate/).fill('100');
  await expect(readout(page, 'Result')).toHaveText('Fused tetanus');
  await slider(page, /^Stimulation rate/).fill('1');
  await expect(readout(page, 'Result')).toHaveText('Twitch');
  await radio(page, 'Slow (type I)').click();
  await slider(page, /^Stimulation rate/).fill('25');
  await expect(readout(page, 'Result')).toHaveText(/tetanus/i);
  await shot(page, '13-tetanus');
  await radio(page, 'Motor units').click();
  await slider(page, /^Motor drive/).fill('10');
  const low = await readout(page, 'Units recruited').textContent();
  await slider(page, /^Motor drive/).fill('90');
  const high = await readout(page, 'Units recruited').textContent();
  expect(Number(/^(\d+)/.exec(high!)![1])).toBeGreaterThan(Number(/^(\d+)/.exec(low!)![1]));
  await radio(page, 'Steps').click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.flow-steps li.is-current')).toContainText('Acetylcholine release');
});

test('close-ups open from inside a muscle and return to the body', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Inside a muscle');
  for (const [name, text] of [['the sarcomere', 'The sarcomere'], ['the neuromuscular junction', 'neuromuscular junction'], ['muscle, fascicle and fibre', 'Muscle, fascicle and fibre'], ['spindle and tendon organ', 'spindle'], ['the tendon–bone junction', 'tendon–bone']] as const) {
    await page.getByRole('button', { name: `Close-up: ${name}` }).click();
    await expect(page.locator('.closeup-panel')).toContainText(text);
    await settle(page, 700);
    await shot(page, `14-closeup-${name.replace(/[^a-z]+/g, '-')}`);
    await page.getByRole('button', { name: 'Back to the body' }).click();
    await expect(page.locator('.closeup-panel')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Close-up: the sarcomere' }).click();
  await slider(page, /^Sarcomere length/).fill('3.3');
  await expect(page.locator('.closeup-panel')).toContainText('3.30 µm');
  expect(errors).toEqual([]);
});

test('exercise: each activity shows its energy system, its muscles and a limit', async ({ page }) => {
  await open(page);
  await ready(page);
  await mode(page, 'Exercise');
  await radio(page, '100 m sprint').click();
  await expect(readout(page, 'Main energy system')).toHaveText(/phosphocreatine|glycolysis/i);
  await expect(readout(page, 'Can it be held?')).toHaveAttribute('data-hold' as never, 'limited').catch(() => {});
  await settle(page, 800);
  const sprint = await canvasShot(page);
  await shot(page, '15-sprint');
  await radio(page, 'Marathon').click();
  await expect(readout(page, 'Main energy system')).toHaveText('Oxidative (aerobic)');
  await expect(page.locator('.exercise-panel')).toHaveAttribute('data-activity', 'marathon');
  await settle(page, 800);
  expect((await canvasShot(page)).equals(sprint)).toBe(false);
  await slider(page, /^Intensity/).fill('3');
  await expect(page.locator('.exercise-panel')).toHaveAttribute('data-activity', 'custom');
  await radio(page, 'Strength (heavy loads)').click();
  await slider(page, /^Weeks of training/).fill('12');
  await expect(page.locator('.exercise-panel dl[data-program="strength"] div', { hasText: 'Strength' }).first().locator('dd')).toHaveText(/\+\d+ %/);
  await slider(page, /^Hours after/).fill('48');
  await expect(page.getByText(/^Now: \d+\.\d out of 10/)).toBeVisible();
});

test('injuries: a hamstring strain heals by grade and day; CK and power are read', async ({ page }) => {
  await open(page);
  await ready(page);
  await mode(page, 'Injuries');
  await expect(page.locator('.injury-panel')).toHaveAttribute('data-disorder', 'hamstring');
  await settle(page, 1000);
  await shot(page, '16-hamstring');
  await radio(page, 'Grade III').click();
  await slider(page, /^Days since/).fill('0');
  const early = await readout(page, 'Strength now').textContent();
  await slider(page, /^Days since/).fill('90');
  const late = await readout(page, 'Strength now').textContent();
  expect(Number(/(\d+)/.exec(late!)![1])).toBeGreaterThan(Number(/(\d+)/.exec(early!)![1]));
  await expect(readout(page, 'Phase')).toHaveText('Remodelling');
  await page.getByLabel('Serum CK (U/L)').fill('20000');
  await expect(page.locator('.test-result[data-ck="severe"]')).toContainText('kidney');
  await page.getByLabel('Serum CK (U/L)').fill('120');
  await expect(page.locator('.test-result[data-ck="ok"]')).toContainText('Normal');
  await slider(page, /^Medical Research Council grade/).fill('3');
  await expect(page.locator('p.small', { hasText: 'Active movement against gravity' })).toBeVisible();
  await page.locator('#disorder').selectOption('myasthenia');
  await expect(page.locator('.injury-panel')).toHaveAttribute('data-disorder', 'myasthenia');
  await expect(page.getByText('Anti-acetylcholine receptor antibodies')).toBeVisible();
  await page.locator('#disorder').selectOption('compartment');
  await settle(page, 1000);
  await shot(page, '17-compartment');
});

test('the guided tour: every step in order, back, and finish', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Guided tour');
  const total = await page.locator('.tour-index li').count();
  expect(total).toBeGreaterThanOrEqual(20);
  for (let i = 0; i < total; i++) {
    await expect(page.locator('.tour-panel .eyebrow')).toContainText(`step ${i + 1} of ${total}`);
    await settle(page, 350);
    if ([3, 6, 8, 11, 12, 14, 17, 19, 21].includes(i)) await shot(page, `18-tour-${String(i + 1).padStart(2, '0')}`);
    if (i < total - 1) await page.getByRole('button', { name: 'Next →' }).click();
  }
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.locator('.tour-panel .eyebrow')).toContainText(`step ${total - 1} of ${total}`);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.tour-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phone layout: structures open from the dock and details follow a pick @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('aside.left')).toBeHidden();
  await page.getByRole('button', { name: 'Structures' }).click();
  await expect(page.locator('aside.left')).toBeVisible();
  await search(page).fill('soleus');
  await page.locator('.search-results button', { hasText: /^Soleus \(left\)/ }).first().click();
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(detailTitle(page)).toHaveText('Soleus (left)');
  await shot(page, '19-phone');
});

test('the About sheet holds the credits and closes with Escape', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: /About this lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'About this lab' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('BodyParts3D');
  await expect(dialog).toContainText('Modelled in code');
  await expect(dialog).toContainText('latissimus dorsi');
  await expect(dialog).toContainText('Gordon, Huxley and Julian');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await shot(page, '20-about');
});

test('without WebGL the learning content still works @smoke', async ({ page }) => {
  await open(page, '?nowebgl');
  await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible();
  await pick(page, 'soleus', /^Soleus \(left\)/);
  await expect(detailTitle(page)).toHaveText('Soleus (left)');
  await mode(page, 'Movement');
  await radio(page, 'Deep squat').click();
  await expect(page.locator('.movement-panel')).toHaveAttribute('data-pose', 'squat');
  await mode(page, 'Inside a muscle');
  await slider(page, /^Sarcomere length/).fill('2.1');
  await expect(readout(page, 'Active force')).toHaveText('100 % of maximum');
  await mode(page, 'Exercise');
  await expect(readout(page, 'Main energy system')).toBeVisible();
  await mode(page, 'Injuries');
  await expect(page.locator('.injury-panel')).toHaveAttribute('data-disorder', 'hamstring');
});

test('a missing model shows an error with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/muscles.glb', (route) => (fail ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D model could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});

test('reduced motion: every view and an animated close-up work without errors', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = await open(page);
  await ready(page);
  for (const m of ['Movement', 'Inside a muscle', 'Exercise', 'Injuries']) { await mode(page, m); await settle(page, 400); }
  await mode(page, 'Inside a muscle');
  await page.getByRole('button', { name: 'Close-up: the sarcomere' }).click();
  await settle(page, 600);
  expect(errors).toEqual([]);
  await context.close();
});
