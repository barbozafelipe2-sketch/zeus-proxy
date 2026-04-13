exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: 'Method not allowed. Use POST.'
      })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const input = String(payload.input || '').trim();
    const agent = String(payload.agent || 'zeus').trim().toLowerCase();
    const workspace = String(payload.workspace || 'Chat').trim();
    const source = String(payload.source || 'pegasus_webapp').trim();

    if (!input) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          status: 'error',
          message: 'Missing input.'
        })
      };
    }

    const lower = input.toLowerCase();

    let toolCall = {
      tool: 'route_command',
      args: { input, agent, workspace, source }
    };

    let message = `${capitalize(agent)} received your command and prepared Olympus execution.`;

    if (lower.includes('email') || lower.includes('send')) {
      toolCall = {
        tool: 'send_email',
        args: {
          to: 'contact@example.com',
          subject: 'Draft from Pegasus',
          body: input,
          requested_by: agent
        }
      };
      message = 'Hermes drafted the email payload and queued it for Olympus confirmation.';
    } else if (lower.includes('task') || lower.includes('tomorrow') || lower.includes('remind')) {
      toolCall = {
        tool: 'create_task',
        args: {
          title: input,
          due_hint: 'tomorrow',
          source,
          requested_by: agent
        }
      };
      message = 'Athena translated that into a task payload with timing context.';
    } else if (lower.includes('report') || agent === 'hades') {
      toolCall = {
        tool: 'load_report',
        args: {
          report_id: 'hiro-report',
          view: 'underworld_dashboard',
          query: input,
          requested_by: agent
        }
      };
      message = 'Hades is surfacing the Hiro Report workspace and preparing archive context.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'success',
        message,
        tool_call: toolCall,
        result: {
          execution_id: `exec_${Date.now()}`,
          mock: true
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: error.message || 'Unexpected server error.'
      })
    };
  }
};

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Zeus';
}
