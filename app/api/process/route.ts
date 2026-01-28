import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { transcript, formData } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      )
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze this conversation notes from meeting someone at a conference/event. Extract structured information and provide a summary with action items.

Conversation notes:
${transcript}

${formData.name ? `Name provided: ${formData.name}` : ''}
${formData.company ? `Company provided: ${formData.company}` : ''}
${formData.role ? `Role provided: ${formData.role}` : ''}
${formData.meetingContext ? `Meeting context: ${formData.meetingContext}` : ''}

Respond in JSON only, no markdown backticks or any other text:
{
  "name": "extracted or provided name",
  "company": "extracted or provided company",
  "role": "extracted or provided role/title",
  "email": "extracted email or null",
  "phone": "extracted phone or null",
  "location": "extracted location or null",
  "summary": "2-3 sentence summary of who they are and what you discussed",
  "keyTopics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"],
  "followUpSuggestion": "suggested follow-up approach"
}`
        }
      ]
    })

    // Extract text content from the response
    const textContent = message.content.find(block => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response')
    }

    // Parse the JSON response
    const cleanedText = textContent.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    
    const parsed = JSON.parse(cleanedText)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Error processing with Claude:', error)
    return NextResponse.json(
      { error: 'Failed to process with AI' },
      { status: 500 }
    )
  }
}
