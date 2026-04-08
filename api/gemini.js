import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://api.yunjintao.com/v1',
});

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300, image_base64, model: reqModel } = req.body;

    // 支持图片输入
    let userContent;
    if (image_base64) {
      userContent = [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
        { type: 'text', text: user }
      ];
    } else {
      userContent = user;
    }

    const response = await client.chat.completions.create({
      model: reqModel || (image_base64 ? 'grok-4.1' : 'grok-4.1'),
      max_tokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('D老师 error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
