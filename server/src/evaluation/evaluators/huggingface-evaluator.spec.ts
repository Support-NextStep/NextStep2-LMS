import { ConfigService } from '@nestjs/config';
import { HuggingFaceEvaluatorService } from './huggingface-evaluator.service';
import { EvaluationConfig } from '../evaluation-config';
import { PermanentEvaluationError, RetryableEvaluationError, type EvaluationInput } from '../evaluator.interface';

// ---------------------------------------------------------------------------
// 15. Provider secret never appears in API response/log output — tested
// here against the real HuggingFaceEvaluatorService with a mocked `fetch`
// (never a real network call), asserting the dummy token value cannot be
// found anywhere in what evaluate() throws or returns, across every failure
// mode this file handles.
// ---------------------------------------------------------------------------

const DUMMY_TOKEN = 'hf_SUPER_SECRET_TOKEN_VALUE_DO_NOT_LEAK_12345';
const DUMMY_MODEL = 'Qwen/Qwen2.5-Coder-32B-Instruct';

function configWith(overrides: Record<string, string>): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

const testEvaluationConfig = new EvaluationConfig(configWith({ AI_EVALUATION_TIMEOUT_MS: '5000' }));

const sampleInput: EvaluationInput = {
  exercise: {
    objective: 'test',
    requirements: ['r1'],
    language: 'javascript',
    evaluationCriteria: ['c1'],
    edgeCases: [],
  },
  files: [{ name: 'a.js', content: 'console.log(1)' }],
};

/** Asserts a value never contains the secret, at any nesting depth. */
function assertNoSecretLeak(value: unknown) {
  const serialized = JSON.stringify(value ?? null);
  expect(serialized).not.toContain(DUMMY_TOKEN);
}

describe('HuggingFaceEvaluatorService — secret handling', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('never includes the token in the "not configured" error when HF_TOKEN is unset', async () => {
    const service = new HuggingFaceEvaluatorService(configWith({ HF_MODEL: DUMMY_MODEL }), testEvaluationConfig);
    await expect(service.evaluate(sampleInput)).rejects.toThrow(PermanentEvaluationError);
    try {
      await service.evaluate(sampleInput);
    } catch (err) {
      assertNoSecretLeak((err as Error).message);
      expect((err as Error).message).not.toMatch(/hf_/);
    }
  });

  it('never includes the token in a network-failure error message', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND router.huggingface.co')) as unknown as typeof fetch;
    const service = new HuggingFaceEvaluatorService(configWith({ HF_TOKEN: DUMMY_TOKEN, HF_MODEL: DUMMY_MODEL }), testEvaluationConfig);
    await expect(service.evaluate(sampleInput)).rejects.toThrow(RetryableEvaluationError);
    try {
      await service.evaluate(sampleInput);
    } catch (err) {
      assertNoSecretLeak((err as Error).message);
    }
  });

  it('never includes the token in a 401 authentication-failure error message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const service = new HuggingFaceEvaluatorService(configWith({ HF_TOKEN: DUMMY_TOKEN, HF_MODEL: DUMMY_MODEL }), testEvaluationConfig);
    await expect(service.evaluate(sampleInput)).rejects.toThrow(PermanentEvaluationError);
    try {
      await service.evaluate(sampleInput);
    } catch (err) {
      assertNoSecretLeak((err as Error).message);
    }
  });

  it('never includes the token in the request URL, only in the Authorization header (sent, never returned/logged)', async () => {
    let capturedUrl: unknown;
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = jest.fn().mockImplementation((url: unknown, init: any) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ choices: [{ message: { content: JSON.stringify(fakeSuccessBody()) } }] }),
      });
    }) as unknown as typeof fetch;

    const service = new HuggingFaceEvaluatorService(configWith({ HF_TOKEN: DUMMY_TOKEN, HF_MODEL: DUMMY_MODEL }), testEvaluationConfig);
    const result = await service.evaluate(sampleInput);

    // The token is sent (correctly) in the Authorization header, and nowhere else — never in the URL, never in the returned EvaluationOutput.
    expect(String(capturedUrl)).not.toContain(DUMMY_TOKEN);
    expect(capturedHeaders?.Authorization).toBe(`Bearer ${DUMMY_TOKEN}`);
    assertNoSecretLeak(result);
    expect(result.providerName).toBe(`huggingface:${DUMMY_MODEL}`);
  });
});

function fakeSuccessBody() {
  return {
    overallScore: 80,
    criteriaResults: [{ criterion: 'c1', score: 80, passed: true, feedback: 'ok' }],
    strengths: ['s1'],
    improvements: [],
    feedback: 'ok overall',
  };
}
