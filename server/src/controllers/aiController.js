import OpenAI from 'openai';
import { validationResult } from 'express-validator';
import { AI } from '../config/constants.js';

/**
 * Generate YAML using OpenAI
 * POST /api/ai/generate
 */
export const generateYaml = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI service is not configured on the server' });
  }

  const { userInput, currentYaml = '' } = req.body;

  const systemPrompt = `You are an expert YAML configuration assistant. Your role is to help users create, modify, and optimize YAML structures for various applications and architectures.

CRITICAL REQUIREMENTS:
1. Always respond with valid YAML syntax
2. For representing child/nested elements, ONLY use "children:" or "nodes:" properties
3. NEVER use other property names like "endpoints:", "tables:", "features:", "integrations:" for nested structures
4. Convert any nested lists into children: or nodes: format
5. Include comprehensive, production-ready configurations
6. Follow best practices for naming, structure, and organization
7. Include relevant properties like ports, hosts, versions, etc.
8. For modifications, preserve existing structure when possible
9. Include helpful comments in YAML when appropriate
10. Structure should be hierarchical and well-organized

NESTED STRUCTURE RULES:
- Use "children:" for main sub-components or services
- Use "nodes:" for items, elements, or data entries
- Example CORRECT format:
  children:
    - name: Auth-Service
      type: service
      nodes:
        - name: Login-Endpoint
        - name: Register-Endpoint

RESPONSE FORMAT:
- Provide a brief explanation of what you're generating/modifying
- Include the complete YAML structure using only children:/nodes: for nesting
- Mention key features or components included

USER'S CURRENT YAML:
${currentYaml ? currentYaml : 'No existing YAML provided'}

USER REQUEST: ${userInput}

Generate appropriate YAML based on the request. If modifying existing YAML, preserve the current structure and add/modify as requested. Remember: ONLY use children: or nodes: for nested elements.`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: AI.MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      max_tokens: AI.MAX_TOKENS,
      temperature: AI.TEMPERATURE,
    });

    const response = completion.choices[0]?.message?.content || '';

    // Extract YAML from response
    let yaml = '';
    let explanation = '';

    const yamlMatch = response.match(/```(?:yaml|yml)?\n([\s\S]*?)\n```/);
    if (yamlMatch) {
      yaml = yamlMatch[1];
      explanation = response.replace(yamlMatch[0], '').trim();
    } else {
      const lines = response.split('\n');
      const yamlStartIndex = lines.findIndex(line =>
        line.match(/^[a-zA-Z0-9_-]+:\s*/) || line.startsWith('name:') || line.startsWith('version:')
      );
      if (yamlStartIndex !== -1) {
        yaml = lines.slice(yamlStartIndex).join('\n');
        explanation = lines.slice(0, yamlStartIndex).join('\n').trim();
      }
    }

    return res.json({
      message: explanation || "I've generated the YAML structure based on your request:",
      yaml: yaml.trim(),
    });
  } catch (error) {
    return res.status(502).json({ error: `AI request failed: ${error.message}` });
  }
};
