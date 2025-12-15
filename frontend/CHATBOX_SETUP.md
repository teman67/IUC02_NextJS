# IUC02 AI ChatBox Setup Guide

## Overview
An AI-powered chatbox has been added to your application using OpenAI's GPT-4 model. The assistant helps users navigate the app, understand RDF/SHACL concepts, and troubleshoot validation issues.

## Setup Instructions

### 1. Get OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Navigate to API keys section
4. Click "Create new secret key"
5. Copy the generated key (you won't be able to see it again!)

### 2. Configure Environment Variable
Open `frontend/.env.local` and replace the placeholder with your actual API key:

```env
OPENAI_API_KEY=sk-your-actual-key-here
```

**Important:** Never commit `.env.local` to version control. It's already in `.gitignore`.

### 3. Restart Development Server
After adding your API key, restart the Next.js development server:

```bash
cd frontend
npm run dev
```

## Features

### ChatBox Component
- **Location:** Bottom-right corner of every page
- **Toggle:** Click the chat icon to open/close
- **Persistent:** Available across all routes
- **Responsive:** Mobile-friendly design

### AI Capabilities
The assistant can help with:
- Explaining RDF and SHACL concepts
- Guiding through data generation workflow
- Troubleshooting validation errors
- Understanding schema requirements
- Navigating application features

### API Route
- **Endpoint:** `/api/chat`
- **Model:** GPT-4o-mini (cost-effective and fast)
- **Context:** Pre-configured with IUC02 framework knowledge
- **Rate Limits:** Follow OpenAI's standard rate limits

## Cost Considerations

### GPT-4o-mini Pricing (as of 2024)
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

### Estimated Usage
- Average conversation: ~500-1000 tokens
- Cost per conversation: ~$0.001-0.002
- 1000 conversations: ~$1-2

### Tips to Reduce Costs
1. Set `max_tokens` limit (currently 500)
2. Monitor usage in OpenAI dashboard
3. Implement rate limiting if needed
4. Consider caching common responses

## Customization

### Change Model
Edit `frontend/src/app/api/chat/route.ts`:
```typescript
model: 'gpt-4o-mini', // Change to 'gpt-4' or 'gpt-3.5-turbo'
```

### Adjust Response Length
```typescript
max_tokens: 500, // Increase for longer responses
```

### Modify System Prompt
Update the `systemMessage.content` in the API route to customize the AI's behavior and knowledge.

### Style Customization
Edit `frontend/src/components/ChatBox.tsx` to change:
- Colors (Tailwind classes)
- Position (fixed coordinates)
- Size (width/height)
- Animation effects

## Troubleshooting

### "OpenAI API key is not configured"
- Ensure `OPENAI_API_KEY` is set in `.env.local`
- Restart the development server
- Check for typos in the key

### "Failed to get response from OpenAI"
- Verify API key is valid
- Check OpenAI account has credits
- Ensure internet connection is stable
- Review OpenAI status page

### Chat not appearing
- Clear browser cache
- Check browser console for errors
- Verify ChatBox is imported in `layout.tsx`

## Files Created/Modified

### New Files
- `frontend/src/components/ChatBox.tsx` - Chat UI component
- `frontend/src/app/api/chat/route.ts` - OpenAI API integration
- `frontend/CHATBOX_SETUP.md` - This guide

### Modified Files
- `frontend/src/app/layout.tsx` - Added ChatBox component
- `frontend/.env.local` - Added OPENAI_API_KEY
- `frontend/.env.local.example` - Updated example
- `frontend/package.json` - Added openai dependency

## Security Notes

1. **Never expose API key:** The key is only used server-side in API routes
2. **Environment variables:** NEXT_PUBLIC_ prefix would expose the key (don't use it!)
3. **Version control:** `.env.local` is gitignored
4. **Production:** Use environment variables in your hosting platform

## Next Steps

1. Add your OpenAI API key to `.env.local`
2. Restart the development server
3. Test the chatbox on any page
4. Monitor usage in OpenAI dashboard
5. Customize the system prompt for your specific needs

## Support

For OpenAI-specific issues, visit:
- [OpenAI Documentation](https://platform.openai.com/docs)
- [OpenAI Community Forum](https://community.openai.com)

For IUC02 app issues, check your project repository or documentation.
