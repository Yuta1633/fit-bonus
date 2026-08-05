export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables' });
  }

  try {
    const { image, mediaType, answers } = req.body;

    const answerLabels = {
      q1: ['体脂肪が多い・お腹周りが気になる', '痩せ型で筋肉量が少ない', '筋肉はあるがメリハリがない', '姿勢や左右バランスが気になる'],
      q2: ['ほぼしていない', '週1〜2回', '週3〜4回', '週5回以上'],
      q3: ['特に管理していない', 'なんとなく気をつけている', 'カロリー・タンパク質を意識している', 'PFCまで細かく管理している'],
      q4: ['全く満足していない', 'あまり満足していない', 'やや満足している', '満足している'],
    };

    const answerText = [
      `気になること: ${answerLabels.q1[answers.q1]}`,
      `トレーニング頻度: ${answerLabels.q2[answers.q2]}`,
      `食事管理: ${answerLabels.q3[answers.q3]}`,
      `体型への満足度: ${answerLabels.q4[answers.q4]}`,
    ].join('\n');

    const systemPrompt = `あなたはフィットネスコーチのアシスタントです。ユーザーの体型写真(任意)とアンケート回答をもとに、体型を前向きな言葉で S/A/B/C/D の5段階でランク付けしてください。

ルール:
- ランクは相対評価ではなく「今後の伸びしろ」を前向きに伝える意図で使う(Dだからダメ、ではなく「これから一番伸びる段階」という励ましのトーンにする)
- 出力は必ず以下のJSON形式のみ。説明文やコードブロックの記号は一切付けない。
- 各カテゴリのvalueは0〜100の整数。
- adviceは必ず2つ。

{
  "rank": "S/A/B/C/Dのいずれか1文字",
  "rankName": "ランクの見出し(15文字以内)",
  "rankSub": "現状を前向きに要約する説明(60文字程度)",
  "categories": [
    {"name": "筋肉量・ボリューム", "value": 0},
    {"name": "引き締まり度", "value": 0},
    {"name": "バランス・姿勢", "value": 0},
    {"name": "食事管理の精度", "value": 0}
  ],
  "advice": [
    {"heading": "改善ポイントの見出し", "text": "具体的な説明(80文字程度)"},
    {"heading": "改善ポイントの見出し", "text": "具体的な説明(80文字程度)"}
  ]
}`;

    const content = [];
    if (image && mediaType) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } });
    }
    content.push({
      type: 'text',
      text: `以下はアンケートの回答です。${image ? '写真も参考にしてください。' : '写真はアップロードされていないので、アンケート回答のみから判定してください。'}\n\n${answerText}\n\n必ずJSONのみで回答してください。`,
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Anthropic API error', detail: errText });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    const raw = textBlock ? textBlock.text : '';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'Failed to parse AI response', raw });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'analysis_failed', detail: String(err) });
  }
}
