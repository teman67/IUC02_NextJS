import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    // System message to provide context about the application
    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant for the IUC02 framework application. This framework is designed for curation and distribution of reference datasets, specifically focusing on creep properties of single crystal Ni-based superalloys.

The application has the following main features:
1. Data Generation: Converting and generating RDF (Resource Description Framework) graphs from various data sources
2. Data Validation: Validating RDF data using SHACL (Shapes Constraint Language) shapes
3. Workflow Management: Managing the complete data pipeline from generation to validation

The application works with:
- RDF graphs (Turtle format .ttl files)
- SHACL shapes for validation
- JSON schemas and mapping documents
- LIS file format conversions

IMPORTANT: You are specifically designed to help with IUC02 framework topics. 

For greetings (hi, hello, hey, etc.):
- Respond warmly and naturally
- Briefly introduce yourself
- Invite them to ask about the app

For questions unrelated to RDF, SHACL, data validation, workflows, or semantic web:
- Acknowledge their question politely
- Gently redirect to your expertise area
- Example: "That's interesting, but I'm here to help you with the IUC02 framework - things like generating RDF data or validating with SHACL. What would you like to know about the application?"

Help users by:
- Explaining RDF and SHACL concepts in simple terms
- Guiding them through the workflow (data generation → validation)
- Troubleshooting validation errors
- Explaining schema requirements
- Helping navigate the application features

Be concise, helpful, and technical when needed but explain complex semantic web concepts clearly. Always stay focused on IUC02-related topics.`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [systemMessage, ...messages],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get response from OpenAI' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
