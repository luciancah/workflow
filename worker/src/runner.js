const axios = require('axios');

const BASE_URL = process.env.CONDUCTOR_BASE_URL || 'http://conductor:8080/api';
const POLL_TYPES = ['ai_mock', 'teams_mock', 'transform_mock', 'http_mock', 'script_mock'];
const POLL_INTERVAL_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTaskPollResponse(data) {
  if (!data) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] || null;
  }
  if (data.taskId) {
    return data;
  }
  return null;
}

function responseFromMock(taskType, task) {
  if (taskType === 'ai_mock') {
    return {
      resultMessage: `Mock AI output for ${task.taskType}`,
      inputEcho: task.inputData || task.input || {},
      outputText: '자동화된 응답 예시입니다.',
    };
  }

  if (taskType === 'teams_mock') {
    return {
      status: 'sent',
      message: task.inputData?.message || task.input?.message || '팀즈 메시지 모사 성공',
      channel: task.inputData?.channel || 'default',
    };
  }

  if (taskType === 'transform_mock') {
    return {
      transformedAt: new Date().toISOString(),
      output: {
        ...(task.inputData || task.input || {}),
        transformed: true,
      },
    };
  }

  if (taskType === 'http_mock') {
    return {
      statusCode: 200,
      statusMessage: 'mock http success',
    };
  }

  return {
    output: task.inputData || task.input || {},
    mocked: true,
  };
}

async function poll(taskType) {
  try {
    const response = await axios.get(`${BASE_URL}/tasks/poll/${taskType}`, {
      params: {
        workerId: 'simulator',
        pollTimeoutSeconds: 2,
      },
      timeout: 5000,
    });

    const task = parseTaskPollResponse(response.data);
    if (!task) {
      return;
    }

    const output = responseFromMock(taskType, task);
    await axios.post(
      `${BASE_URL}/tasks`,
      {
        workflowInstanceId: task.workflowInstanceId,
        taskId: task.taskId,
        status: 'COMPLETED',
        outputData: output,
        logs: [`taskType=${taskType} completed by simulator`],
      },
      {
        headers: { 'content-type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
    if (!error.response) {
      console.error('poll worker error', message);
    }
  }
}

async function run() {
  console.log(`[worker] start simulator (${BASE_URL})`);
  while (true) {
    for (const taskType of POLL_TYPES) {
      await poll(taskType);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

run();

