#!/usr/bin/env bash
# Run this script once to create all GitHub labels for the project
# Requires: gh CLI authenticated

set -e
OWNER="lssmanager"
REPO="agent-visualstudio"

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --color "$color" --description "$desc" --repo "$OWNER/$REPO" --force
}

echo "=== Priority Labels ==="
create_label "priority:critical" "D93F0B" "Blocking release or causing data loss"
create_label "priority:high"     "E4585E" "Important, needs attention this sprint"
create_label "priority:medium"   "FBCA04" "Normal priority"
create_label "priority:low"      "0075CA" "Nice to have"

echo "=== Type Labels ==="
create_label "type:feature"       "0052CC" "New feature or enhancement"
create_label "type:bug"           "D73A4A" "Something is broken"
create_label "type:refactor"      "E4E669" "Code improvement without functional change"
create_label "type:architecture"  "6E5494" "Architectural decision or change"
create_label "type:research"      "BFD4F2" "Research spike or investigation"
create_label "type:documentation" "0075CA" "Documentation only"
create_label "type:security"      "B60205" "Security fix or hardening"
create_label "type:performance"   "F9D0C4" "Performance improvement"
create_label "type:observability" "C2E0C6" "Observability, monitoring, tracing"

echo "=== Area Labels ==="
for area in runtime flows agents hierarchy memory rag channels providers gateway ui dashboard auth mcp tools skills templates evals security deployment; do
  create_label "area:$area" "1D76DB" "Area: $area"
done

echo "=== Channel Labels ==="
create_label "channel:whatsapp" "25D366" "WhatsApp channel"
create_label "channel:telegram" "2CA5E0" "Telegram channel"
create_label "channel:webchat"  "6F42C1" "WebChat channel"
create_label "channel:discord"  "5865F2" "Discord channel"
create_label "channel:teams"    "6264A7" "Microsoft Teams channel"

echo "=== Provider Labels ==="
create_label "provider:openai"        "10A37F" "OpenAI provider"
create_label "provider:anthropic"     "C5783A" "Anthropic provider"
create_label "provider:gemini"        "4285F4" "Google Gemini provider"
create_label "provider:openrouter"    "FF6B35" "OpenRouter provider"
create_label "provider:ollama"        "333333" "Ollama local provider"
create_label "provider:groq"          "F55036" "Groq provider"
create_label "provider:mistral"       "FF6B6B" "Mistral provider"
create_label "provider:deepseek"      "0070F3" "DeepSeek provider"
create_label "provider:xai"           "000000" "xAI / Grok provider"
create_label "provider:together"      "8B5CF6" "Together AI provider"
create_label "provider:fireworks"     "F97316" "Fireworks AI provider"
create_label "provider:cerebras"      "6366F1" "Cerebras provider"
create_label "provider:perplexity"    "20B2AA" "Perplexity provider"
create_label "provider:bedrock"       "FF9900" "Amazon Bedrock provider"
create_label "provider:litellm"       "64748B" "LiteLLM gateway"
create_label "provider:cloudflare"    "F48024" "Cloudflare AI Gateway"
create_label "provider:huggingface"   "FFD21E" "HuggingFace provider"
create_label "provider:moonshot"      "7C3AED" "Moonshot AI (Kimi) provider"
create_label "provider:qwen"          "1677FF" "Qwen Cloud provider"
create_label "provider:volcengine"    "E34D26" "Volcengine (Doubao) provider"
create_label "provider:elevenlabs"    "4F46E5" "ElevenLabs TTS provider"
create_label "provider:runway"        "FF0080" "Runway video generation"
create_label "provider:fal"           "111111" "fal image/video generation"
create_label "provider:comfyui"       "2D333B" "ComfyUI image generation"
create_label "provider:vllm"          "16A34A" "vLLM local inference"
create_label "provider:lmstudio"      "7C3AED" "LM Studio local inference"
create_label "provider:venice"        "6B21A8" "Venice privacy provider"
create_label "provider:nvidia"        "76B900" "NVIDIA NIM provider"
create_label "provider:github-copilot" "24292E" "GitHub Copilot provider"

echo "=== Status Labels ==="
create_label "blocked"            "B60205" "Blocked by another issue or external dependency"
create_label "needs-design"       "E4E669" "Needs design work before implementation"
create_label "needs-research"     "BFD4F2" "Needs research or investigation"
create_label "breaking-change"    "D93F0B" "Introduces a breaking change"
create_label "good-first-issue"   "7057FF" "Good for newcomers"

echo "\nAll labels created successfully!"
