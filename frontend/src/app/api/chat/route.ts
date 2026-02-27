import { NextRequest, NextResponse } from "next/server";
import { chatCache } from "@/lib/chatCache";

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    // Get client IP for rate limiting
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Check if user is penalized for off-topic questions
    const penalty = chatCache.checkPenalty(ip);
    if (penalty.penalized) {
      return NextResponse.json(
        {
          error: `You've been temporarily restricted for asking off-topic questions. Please wait ${penalty.retryAfter} seconds and focus on IUC02-related topics (RDF, SHACL, data validation).`,
          retryAfter: penalty.retryAfter,
          isPenalty: true,
        },
        {
          status: 403,
          headers: {
            "Retry-After": penalty.retryAfter?.toString() || "300",
          },
        }
      );
    }

    // Check rate limit
    const rateLimit = chatCache.checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait before sending more messages.",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimit.retryAfter?.toString() || "60",
          },
        }
      );
    }

    // Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages format" },
        { status: 400 }
      );
    }

    // Limit message history to last 10 messages to prevent abuse
    const limitedMessages = messages.slice(-10);

    // Get the last user message for caching (ignore conversation history)
    const lastUserMessage = limitedMessages[limitedMessages.length - 1];

    // Check cache - cache based on user's question only
    const cacheKey = chatCache.getCacheKey([lastUserMessage]);
    const cachedResponse = chatCache.get(cacheKey);

    console.log("🔍 Cache check:", {
      userQuestion: lastUserMessage.content.substring(0, 50),
      cacheHit: !!cachedResponse,
    });

    if (cachedResponse) {
      console.log("✅ CACHE HIT - Returning cached response");
      return NextResponse.json({
        message: cachedResponse,
        cached: true,
      });
    }

    console.log("❌ CACHE MISS - Calling OpenAI API");

    // System message to provide context about the application
    const systemMessage = {
      role: "system",
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

=== ON-TOPIC QUESTIONS (Answer these normally) ===
Questions about ANY of these topics are ON-TOPIC and should be answered helpfully:
✓ RDF, RDFS, RDF files, RDF graphs, triples, subjects, predicates, objects (any capitalization)
✓ SHACL, SHACL shapes, validation, constraints (any capitalization)
✓ Turtle (.ttl), JSON-LD, N-Triples, RDF/XML serialization formats
✓ OWL, ontologies, semantic web, knowledge graphs, linked data
✓ Data validation, data generation, workflows, pipelines
✓ Schemas, metadata, namespaces, IRIs, URIs
✓ Materials science data (in context of RDF/SHACL)
✓ This IUC02 application and its features
✓ How to use the app, troubleshooting, navigation
✓ Greetings (hi, hello, hey) - respond warmly

Examples of ON-TOPIC questions:
- "What is RDF?" / "what is rdf file?" / "explain RDF"
- "How does SHACL work?"
- "What's a triple?"
- "How do I validate data?"
- "What is Turtle format?"

=== OFF-TOPIC QUESTIONS (Use [OFF_TOPIC] marker) ===
ONLY mark as off-topic if the question is completely unrelated to the above topics.
Examples: weather, sports, cooking, general programming (not related to RDF/SHACL), math homework, etc.

If a question is OFF-TOPIC:
1. Start your response with: [OFF_TOPIC]
2. Then politely redirect: "That's not related to the IUC02 framework. I can help with RDF, SHACL, data validation, and semantic web topics. What would you like to know?"

Be helpful, clear, and concise. Explain technical concepts in simple terms when needed.`,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [systemMessage, ...limitedMessages],
        temperature: 0.7,
        max_tokens: 500,
        user: ip.substring(0, 50), // OpenAI user identifier for abuse monitoring
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      return NextResponse.json(
        { error: "Failed to get response from OpenAI" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    // Check if the response indicates an off-topic question
    if (assistantMessage.startsWith("[OFF_TOPIC]")) {
      console.log("⚠️ Off-topic question detected - tracking strike");

      // Track the off-topic question
      const result = chatCache.trackOffTopic(ip);

      // Remove the marker from the message before sending to user
      const cleanedMessage = assistantMessage.replace("[OFF_TOPIC]", "").trim();

      // Build warning message based on strike count
      let warning = "";
      if (result.shouldPenalize) {
        warning = `You've asked ${result.strikeCount} off-topic questions. You are now restricted for 5 minutes. Please focus on IUC02-related topics.`;
      } else {
        const remaining = 3 - result.strikeCount;
        warning = `Off-topic question detected (Strike ${result.strikeCount}/3). ${remaining} more off-topic question(s) will result in a 5-minute restriction.`;
      }

      // Don't cache off-topic responses
      return NextResponse.json({
        message: cleanedMessage,
        warning: warning,
        strikeCount: result.strikeCount,
      });
    }

    // Cache the response (only for on-topic questions)
    console.log("💾 Storing response in cache");
    chatCache.set(cacheKey, assistantMessage);

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
