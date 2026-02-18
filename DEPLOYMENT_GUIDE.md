# Legal AI Web Intake Widget — Deployment Guide
## JR Cloud Technologies LLC

---

## Project Structure

```
legal-ai-web-widget/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vercel.json              ← Vercel auto-config
├── netlify.toml             ← Netlify auto-config
├── .env.example             ← Copy to .env, add your API key
├── .gitignore
│
└── src/
    ├── main.tsx             ← Entry point
    ├── App.tsx              ← Main widget (ALL logic is here)
    ├── types.ts             ← TypeScript interfaces
    └── index.css            ← Tailwind + custom styles
```

---

## STEP 1: Configure Per Client

Open `src/App.tsx` and edit the `CLIENT_CONFIG` block at the very top:

```typescript
const CLIENT_CONFIG = {
  clientId: 'martinez-law',                    // Unique slug (no spaces)
  firmName: 'Martinez Criminal Defense',        // Display name
  firmTagline: 'AI-Powered Legal Intake',       // Shown in widget
  aiAssistantName: 'Sarah',                     // AI agent name
  primaryColor: '#1B2A4A',                      // Navy (change to firm brand)
  accentColor: '#C4A35A',                       // Gold (change to firm accent)

  // Your n8n webhook — this receives the leads
  webhookUrl: 'https://jcr656.app.n8n.cloud/webhook/legal-intake-martinez',

  // Practice areas this firm handles
  practiceAreas: ['Criminal Defense', 'DUI/DWI'],

  // Gemini API key (shared or per-client)
  geminiApiKey: 'AIzaSyCD_I8Ww0EC_NdQhoreXUypCtFPW_t13j0',
};
```

---

## STEP 2: Deploy (Pick One)

---

### OPTION A: Vercel (Recommended — Easiest)

**Why:** Free tier, instant HTTPS, automatic builds, custom domains

#### First Time Setup

```powershell
# 1. Install Vercel CLI
npm install -g vercel

# 2. Navigate to project folder
cd D:\OneDrive\Desktop\legal-ai-web-widget

# 3. Install dependencies
npm install

# 4. Create .env file
copy .env.example .env
# Edit .env and add your Gemini API key

# 5. Test locally first
npm run dev
# Open http://localhost:5173 to test admin view
# Open http://localhost:5173/?view=widget to test widget view

# 6. Deploy to Vercel
vercel

# First time: it will ask you to login and link to a project
# Answer the prompts:
#   - Set up and deploy? Y
#   - Which scope? (select your account)
#   - Link to existing project? N
#   - Project name: legal-ai-martinez (use client slug)
#   - Directory: ./
#   - Override settings? N

# 7. Set environment variable on Vercel
vercel env add VITE_GEMINI_API_KEY
# Paste your API key when prompted

# 8. Deploy to production
vercel --prod
```

#### Your Widget URL
```
https://legal-ai-martinez.vercel.app/?view=widget
```

#### Add Custom Domain (optional)
```powershell
vercel domains add intake.martinezlaw.com
```
Then add the CNAME record they give you in your DNS.

---

### OPTION B: Netlify (Also Free)

```powershell
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Navigate to project
cd D:\OneDrive\Desktop\legal-ai-web-widget

# 3. Install and build
npm install
npm run build

# 4. Deploy
netlify deploy --prod --dir=dist

# First time: login and create a new site
# Site name: legal-ai-martinez
```

#### Your Widget URL
```
https://legal-ai-martinez.netlify.app/?view=widget
```

---

### OPTION C: GitHub Pages (Free, but manual builds)

```powershell
# 1. Build the project
npm install
npm run build

# 2. Push the dist folder to GitHub Pages
# In your GitHub repo settings → Pages → Source: Deploy from branch
# Upload the contents of the dist/ folder to the gh-pages branch

npx gh-pages -d dist
```

---

### OPTION D: Your Own Server / VPS

```bash
# 1. Build on your machine
npm install
npm run build

# 2. Upload the dist/ folder to your server
scp -r dist/* user@yourserver:/var/www/legal-intake/

# 3. Configure nginx
# /etc/nginx/sites-available/legal-intake
server {
    listen 80;
    server_name intake.jrcloudtech.cloud;
    root /var/www/legal-intake;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 4. Enable and restart
sudo ln -s /etc/nginx/sites-available/legal-intake /etc/nginx/sites-enabled/
sudo certbot --nginx -d intake.jrcloudtech.cloud
sudo systemctl restart nginx
```

---

## STEP 3: Embed on Client's Website

Once deployed, give the client this code to add to their site:

### Basic Embed (Bottom Right Corner)
```html
<!-- Legal AI Intake Widget - JR Cloud Technologies -->
<div id="legal-ai-widget" style="
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 400px;
  height: 650px;
  z-index: 9999;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  display: none;
">
  <iframe
    src="https://legal-ai-martinez.vercel.app/?view=widget"
    width="400"
    height="650"
    style="border: none; border-radius: 20px;"
    allow="microphone"
  ></iframe>
</div>

<!-- Floating Button to Open Widget -->
<button id="legal-ai-toggle" onclick="
  var w = document.getElementById('legal-ai-widget');
  var b = document.getElementById('legal-ai-toggle');
  if (w.style.display === 'none') {
    w.style.display = 'block';
    b.innerHTML = '✕';
    b.style.background = '#ef4444';
  } else {
    w.style.display = 'none';
    b.innerHTML = '⚖️ Need Legal Help?';
    b.style.background = '#1B2A4A';
  }
" style="
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  background: #1B2A4A;
  color: white;
  border: none;
  padding: 16px 24px;
  border-radius: 50px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(27,42,74,0.4);
  font-family: Georgia, serif;
">⚖️ Need Legal Help?</button>
```

### Inline Embed (Inside a page section)
```html
<div style="max-width: 420px; margin: 0 auto;">
  <iframe
    src="https://legal-ai-martinez.vercel.app/?view=widget"
    width="100%"
    height="650"
    style="border: none; border-radius: 20px;"
    allow="microphone"
  ></iframe>
</div>
```

### WordPress (Elementor / Block Editor)
1. Add a **Custom HTML** block
2. Paste the floating button embed code above
3. Update/Publish

### GHL Funnel / Landing Page
1. Edit the funnel page in GHL
2. Add a **Custom Code** element
3. Paste the embed code
4. Save and publish

---

## STEP 4: Multi-Client Deployment

For each new law firm client, you have two options:

### Option 1: Separate Deploys (Recommended)
Clone the project per client. Each gets their own Vercel/Netlify site.

```powershell
# Clone template
xcopy /E /I legal-ai-web-widget legal-ai-CLIENT-NAME

# Edit CLIENT_CONFIG in src/App.tsx
# Deploy to Vercel with unique project name
cd legal-ai-CLIENT-NAME
vercel --prod
```

**Pros:** Full isolation, independent updates, unique URLs  
**Cons:** More deploys to manage

### Option 2: URL Parameters (Advanced)
Keep one deployment, pass config via URL params:

```
?view=widget&firm=martinez&color=1B2A4A
```

Then parse in App.tsx. This is more advanced but means one deployment serves all clients.

---

## STEP 5: Connect to n8n Workflow

The widget sends leads to the SAME n8n webhook as your Vapi phone intake. Your n8n workflow needs one small addition:

### In the Parse/Route node, add a source check:

```javascript
// In your n8n Code node that processes incoming webhooks
const source = $input.item.json.source; // 'phone' from Vapi, 'web_chat' from widget

// Both use the same payload format, so the rest of the workflow is identical
const leadData = $input.item.json.tool_calls[0].parameters;

// Optional: tag differently in GHL
const tags = ['ai-intake', source === 'web_chat' ? 'web-lead' : 'phone-lead'];
```

That's it. Everything else (GHL contact creation, pipeline, notifications) works the same.

---

## Testing Checklist

Before going live with any client:

- [ ] Open admin view — verify firm name, practice areas display correctly
- [ ] Open widget view (`?view=widget`) — verify branding and colors
- [ ] Click "Speak with Intake Specialist" — verify microphone permission prompt
- [ ] Have a test conversation (DUI scenario works well)
- [ ] End session — verify "attorney will contact you" message appears
- [ ] Check n8n execution log — verify webhook received the payload
- [ ] Check GHL — verify contact was created with correct data
- [ ] Check notifications — verify attorney got email/SMS alert
- [ ] Test the embed code on a test HTML page
- [ ] Test on mobile (responsive widget view)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Microphone not working | Must be HTTPS (localhost or deployed with SSL) |
| "Failed to connect" | Check Gemini API key in CLIENT_CONFIG |
| Webhook not receiving | Check n8n workflow is active, URL matches |
| Widget not showing in iframe | Add `allow="microphone"` to iframe tag |
| Audio not playing | User must interact with page first (browser policy) |
| CORS errors | Vercel/Netlify handle this automatically |
| Widget looks cut off on mobile | Use width="100%" instead of fixed 400px |

---

## Cost Summary

| Component | Per Client/Month |
|-----------|-----------------|
| Vercel hosting | $0 (free tier: 100GB bandwidth) |
| Gemini API (~200 conversations) | $5-10 |
| n8n (shared) | $0 (amortized) |
| Custom domain (optional) | $0 if using firm's existing domain |
| **Total per client** | **$5-10/month** |

This is essentially pure profit on top of the $497-$1,997/month you charge.

---

*JR Cloud Technologies LLC | St. Cloud, Florida*
