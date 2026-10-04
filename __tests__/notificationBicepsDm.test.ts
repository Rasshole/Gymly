import {
  __bicepsDmQueueDepthForTests,
  __resetBicepsDmQueueForTests,
  newClientMessageId,
} from '../src/services/notifications/notificationBicepsDm';

jest.mock('@/services/supabase/dmService', () => ({
  getOrCreateDmThread: jest.fn(),
  sendDmMessage: jest.fn(),
  userFacingDmError: (e: unknown) =>
    e instanceof Error ? e.message : 'error',
}));

jest.mock('@/services/supabase/userBlockService', () => ({
  usersAreBlocked: jest.fn(async () => false),
}));

jest.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      getChatByParticipants: () => null,
      upsertChat: jest.fn(),
      addMessageToChat: jest.fn(),
      updateChatLastMessage: jest.fn(),
      resolvePendingDmMessage: jest.fn(),
      abortPendingDmMessage: jest.fn(),
    }),
  },
}));

describe('notificationBicepsDm helpers', () => {
  beforeEach(() => {
    __resetBicepsDmQueueForTests();
  });

  it('generates unique client message ids', () => {
    const a = newClientMessageId();
    const b = newClientMessageId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(a).not.toBe(b);
  });

  it('starts with empty queue', () => {
    expect(__bicepsDmQueueDepthForTests()).toBe(0);
  });
});
