# NetworkNote 📝🎤

A voice-powered contact CRM for capturing conversations at conferences and networking events. Record your conversations, get AI-powered summaries, and export contacts directly to your phone.

![NetworkNote Screenshot](./screenshot.png)

## Features

- 🎤 **Voice Dictation** - Record conversation notes hands-free using Web Speech API
- 📸 **Photo Capture** - Upload or take photos of people you meet
- 🤖 **AI Summaries** - Automatically extract key topics, action items, and follow-up suggestions
- 📱 **vCard Export** - Download contact cards (.vcf) to save directly to your phone
- 💾 **Local Storage** - All contacts saved locally in your browser
- 📲 **PWA Ready** - Install as a mobile app for quick access

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude API
- **Speech**: Web Speech API
- **Storage**: localStorage (client-side)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- An Anthropic API key ([get one here](https://console.anthropic.com/))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/network-note.git
   cd network-note
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Then edit `.env.local` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the app**
   
   Visit [http://localhost:3000](http://localhost:3000)

## Deploying to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/network-note&env=ANTHROPIC_API_KEY&envDescription=Your%20Anthropic%20API%20key%20for%20AI%20summaries)

### Option 2: Manual Deploy

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/network-note.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add environment variable:
     - Name: `ANTHROPIC_API_KEY`
     - Value: Your API key
   - Click "Deploy"

3. **Access your app**
   
   Your app will be live at `https://your-project.vercel.app`

## Project Structure

```
network-note/
├── app/
│   ├── api/
│   │   └── process/
│   │       └── route.ts      # AI processing endpoint
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main app component
├── public/
│   └── manifest.json         # PWA manifest
├── .env.example              # Environment template
├── .env.local                # Your local env (gitignored)
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Usage Guide

### Adding a New Contact

1. Tap the **+** button
2. (Optional) Upload a photo by tapping the camera icon
3. Fill in any details you already know (name, company, etc.)
4. Tap the **microphone** to start recording
5. Dictate your conversation notes naturally:
   > "Met Sarah from Acme Corp, she's the VP of Engineering. We talked about their migration to Kubernetes and she mentioned they're hiring senior engineers. She's interested in our monitoring solution. Should follow up next week with a demo."
6. Tap **Generate Summary & Save**
7. Review the AI-generated summary, topics, and action items

### Exporting Contacts

1. Open a contact's detail page
2. Tap **Save Contact Card (.vcf)**
3. The vCard file will download
4. Open the file on your phone to add to Contacts

## Customization

### Changing the AI Model

Edit `app/api/process/route.ts`:
```typescript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514', // Change model here
  // ...
})
```

### Modifying the Prompt

The AI prompt can be customized in the same file to extract different information or change the output format.

### Styling

- Colors are defined in `tailwind.config.js`
- Global styles in `app/globals.css`
- Component styles use Tailwind utility classes

## Browser Support

- **Chrome/Edge**: Full support (voice + all features)
- **Safari**: Full support (voice + all features)
- **Firefox**: Limited voice support (may require enabling)

## Privacy

- All contact data is stored **locally** in your browser
- Voice processing happens **on-device** via Web Speech API
- Only the transcript text is sent to the AI API for processing
- No data is stored on servers

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for personal or commercial projects.

---

Built with ❤️ for networkers everywhere
