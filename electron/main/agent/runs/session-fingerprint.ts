import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveLightModel, resolvePrimaryModel } from '@shared/lib/model-slots'
import type { AppConfig } from '../../config.ts'
import { resolveNovelAgentsGuide } from '../runtime/novel-agents-guide.ts'

export const AGENT_SESSION_CONTRACT_REVISION = 1

export interface AgentSessionFingerprintInput {
  config: AppConfig
  projectId?: string
  projectPath?: string
  mode: 'direct' | 'project-command'
  loadNarraCatRuntime: boolean
  maxTurns?: number
  allowedTools?: string[]
  /** 本次 run 的 runtime 标识（adapter id）：切 runtime 必须触发会话失效，session id 不跨 runtime 复用。 */
  runtimeId: 'claude-sdk' | 'pi'
  agentCoreVersion: string
}

export async function createAgentSessionCompatibilityFingerprint(
  input: AgentSessionFingerprintInput,
): Promise<string> {
  const canonicalProjectPath = input.projectPath
    ? await realpath(input.projectPath).catch(() => resolve(input.projectPath!))
    : undefined
  const novelAgentsGuide = (await resolveNovelAgentsGuide(input.projectPath)) ?? ''
  const primary = resolvePrimaryModel(input.config)
  const light = resolveLightModel(input.config)
  const normalized = {
    projectId: input.projectId?.trim() || null,
    projectPath: canonicalProjectPath?.normalize('NFC') ?? null,
    // 模型池化：指纹绑定「解析后的主力/轻量」而非整份池——池增删不影响会话，切槽位才断。
    // wire 纳入指纹：切协议（anthropic/openai）换 wire 语义，旧会话必须失效（提示开新对话）。
    primaryModel: primary
      ? { provider: primary.provider, baseUrl: primary.baseUrl, wire: primary.wire, modelId: primary.modelId }
      : null,
    lightModel: light ? { provider: light.provider, modelId: light.modelId } : null,
    apiKeyGeneration: primary ? (input.config.apiKeyMetadata[primary.provider]?.updatedAt ?? null) : null,
    agentCoreVersion: input.agentCoreVersion,
    sessionContractRevision: AGENT_SESSION_CONTRACT_REVISION,
    novelAgentsGuide,
    mode: input.mode,
    loadNarraCatRuntime: input.loadNarraCatRuntime,
    maxTurns: input.maxTurns ?? null,
    allowedTools: [...(input.allowedTools ?? [])].sort(),
    runtimeId: input.runtimeId,
  }
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex')
}
