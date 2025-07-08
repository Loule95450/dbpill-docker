import React, { Component } from 'react';
import styled from 'styled-components';
import { AppContext } from '../context/AppContext';
import { ActionButton, LoadingIndicator } from '../styles/Styled';
import { adminApi } from '../utils/HttpApi';

/* -------------------------------------------------------------------------- */
/*                                  Styles                                    */
/* -------------------------------------------------------------------------- */

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 24px;
  margin-bottom: 20px;
  color: #fff;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
  background-color: rgba(0, 0, 0, 0.3);
  padding: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-weight: 600;
  color: #fff;
  font-size: 14px;
`;

const Input = styled.input`
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-family: 'Inconsolata', monospace;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: color(display-p3 0.964 0.7613 0.3253);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const Select = styled.select`
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-family: 'Inconsolata', monospace;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: color(display-p3 0.964 0.7613 0.3253);
  }

  option {
    background-color: #333;
    color: #fff;
  }
`;

const Button = styled.button`
  padding: 12px 24px;
  background-color: color(display-p3 0.964 0.7613 0.3253);
  color: #000;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Inconsolata', monospace;
  font-size: 14px;
  align-self: flex-start;

  &:hover {
    background-color: color(display-p3 0.9 0.7 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Message = styled.div<{ type: 'success' | 'error' }>`
  padding: 12px;
  border-radius: 4px;
  background-color: ${props => props.type === 'success' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)'};
  border: 1px solid ${props => props.type === 'success' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'};
  color: ${props => props.type === 'success' ? '#4CAF50' : '#F44336'};
  font-size: 14px;
`;

const Description = styled.p`
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
`;

const HelpText = styled.span`
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin-top: 4px;
`;

/* -------------------------------------------------------------------------- */

interface VendorApiKeys {
  anthropic?: string;
  openai?: string;
  xai?: string;
  google?: string;
}

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-0',
  openai: 'o3',
  gemini: 'gemini-2.5-pro',
  grok: 'grok-3-beta'
};

interface ConfigsState {
  loading: boolean;
  resetting: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  messageTarget?: 'config' | 'apiKeys';
  endpointType: 'anthropic' | 'openai' | 'gemini' | 'grok' | 'custom';
  customUrl: string;
  formData: {
    llm_model: string;
    llm_api_key: string;
  };
  apiKeys: VendorApiKeys;
}

const InlineMessage = styled.span<{ type: 'success' | 'error' }>`
  color: ${props => (props.type === 'success' ? '#4CAF50' : '#F44336')};
  font-size: 14px;
`;

export class Configs extends Component<{}, ConfigsState> {
  static contextType = AppContext;
  declare context: React.ContextType<typeof AppContext>;

  constructor(props: {}) {
    super(props);

    this.state = {
      loading: false,
      resetting: false,
      message: null,
      messageTarget: undefined,
      endpointType: 'anthropic',
      customUrl: '',
      formData: {
        llm_model: '',
        llm_api_key: ''
      },
      apiKeys: {
        anthropic: '',
        openai: '',
        xai: '',
        google: ''
      }
    };
  }

  componentDidMount() {
    this.initializeFromConfig();
  }

  componentDidUpdate(prevProps: {}, prevState: ConfigsState) {
    // Re-initialize if context becomes available
    if (this.context?.config && !prevState.formData.llm_model) {
      this.initializeFromConfig();
    }
  }

  initializeFromConfig = () => {
    const { config } = this.context || {};
    if (!config) return;

    const endpoint = config.llm_endpoint || 'anthropic';
    const endpointType =
      endpoint === 'anthropic' || endpoint === 'openai' || endpoint === 'gemini' || endpoint === 'grok'
        ? (endpoint as ConfigsState['endpointType'])
        : 'custom';

    const customUrl = endpointType === 'custom' ? endpoint : '';

    const defaultModel =
      config.llm_model ||
      (endpointType in DEFAULT_MODELS ? DEFAULT_MODELS[endpointType as keyof typeof DEFAULT_MODELS] : '');

    this.setState({
      endpointType,
      customUrl,
      formData: {
        llm_model: defaultModel,
        llm_api_key: config.llm_api_key || ''
      },
      apiKeys: {
        anthropic: config.apiKeys?.anthropic || '',
        openai: config.apiKeys?.openai || '',
        xai: config.apiKeys?.xai || '',
        google: config.apiKeys?.google || ''
      }
    });
  };

  /* ------------------------------ Handlers ------------------------------ */

  handleEndpointChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as ConfigsState['endpointType'];

    this.setState(
      prev => ({
        endpointType: newType,
        customUrl: newType === 'custom' ? 'https://' : '',
        formData: {
          ...prev.formData,
          llm_model:
            newType !== 'custom' && newType in DEFAULT_MODELS
              ? DEFAULT_MODELS[newType as keyof typeof DEFAULT_MODELS]
              : prev.formData.llm_model
        }
      }),
      () => this.save('config')
    );
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    this.setState(prev => ({
      formData: {
        ...prev.formData,
        [name]: value
      }
    }));
  };

  handleCustomUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ customUrl: e.target.value });
  };

  handleApiKeyChange = (vendor: keyof VendorApiKeys, value: string) => {
    this.setState(prev => ({
      apiKeys: {
        ...prev.apiKeys,
        [vendor]: value
      }
    }));
  };

  handleKeyDown = (target: 'config' | 'apiKeys') => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.save(target);
    }
  };

  /* ------------------------------ Save Logic ---------------------------- */

  save = async (target: 'config' | 'apiKeys') => {
    if (this.state.loading) return;

    this.setState({ loading: true, message: null, messageTarget: target });

    const { updateConfig } = this.context;
    const { endpointType, customUrl, formData, apiKeys } = this.state;

    const submitData = {
      llm_endpoint: endpointType === 'custom' ? customUrl : endpointType,
      ...formData,
      apiKeys
    };

    try {
      await updateConfig(submitData);
      this.setState({ loading: false, message: { type: 'success', text: 'Saved!' }, messageTarget: target });
      setTimeout(() => this.setState({ message: null }), 2500);
    } catch (error) {
      console.error('Error updating config:', error);
      this.setState({ loading: false, message: { type: 'error', text: 'Save failed' }, messageTarget: target });
    }
  };

  /* ---------------------------- Reset Handler --------------------------- */

  handleReset = async () => {
    if (!confirm('Are you sure you want to clear all query logs? This action cannot be undone.')) return;

    this.setState({ resetting: true });
    try {
      await adminApi.resetQueryLogs();
      alert('Query logs have been cleared.');
    } catch (error: any) {
      console.error('Error resetting query logs:', error);
      alert(error.message || 'Failed to reset query logs');
    } finally {
      this.setState({ resetting: false });
    }
  };

  /* ------------------------------ Render ------------------------------- */

  render() {
    const { config } = this.context;
    const {
      loading,
      resetting,
      message,
      messageTarget,
      endpointType,
      customUrl,
      formData,
      apiKeys
    } = this.state;

    if (!config) {
      return (
        <Container>
          <Title>Loading Configuration...</Title>
        </Container>
      );
    }

    return (
      <Container>
        <Title>LLM Configuration</Title>
        <Description>
          Configure the Language Model settings for query optimization suggestions.
          These settings are stored locally and persist across restarts.
        </Description>

        {/* LLM Config Form */}
        <Form autoComplete="off" onKeyDown={this.handleKeyDown('config')}>
          <FormGroup>
            <Label htmlFor="llm_endpoint_type">LLM Endpoint</Label>
            <Select
              id="llm_endpoint_type"
              value={endpointType}
              onChange={this.handleEndpointChange}
              required
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="grok">Grok (xAI)</option>
              <option value="custom">Custom URL</option>
            </Select>
            <HelpText>Choose the LLM service provider</HelpText>
          </FormGroup>

          {endpointType === 'custom' && (
            <FormGroup>
              <Label htmlFor="custom_url">Custom URL</Label>
              <Input
                type="url"
                id="custom_url"
                value={customUrl}
                onChange={this.handleCustomUrlChange}
                placeholder="https://api.example.com/v1"
                required
              />
              <HelpText>Enter the full URL for your custom LLM endpoint</HelpText>
            </FormGroup>
          )}

          <FormGroup>
            <Label htmlFor="llm_model">Model</Label>
            <Input
              type="text"
              id="llm_model"
              name="llm_model"
              value={formData.llm_model}
              onChange={this.handleInputChange}
              placeholder="claude-sonnet-4, gpt-4, o3, etc."
              required
            />
            <HelpText>Specify the model name/identifier for the LLM service</HelpText>
          </FormGroup>

          {endpointType === 'custom' && (
            <FormGroup>
              <Label htmlFor="llm_api_key">API Key</Label>
              <Input
                type="text"
                id="llm_api_key"
                name="llm_api_key"
                value={formData.llm_api_key}
                onChange={this.handleInputChange}
                placeholder="Enter API key for custom endpoint"
                autoComplete="off"
                inputMode="text"
                spellCheck={false}
                data-lpignore="true"
              />
              <HelpText>API key for the custom LLM endpoint (stored locally)</HelpText>
            </FormGroup>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button type="button" onClick={() => this.save('config')} disabled={loading && messageTarget === 'config'}>
              Update Configuration
            </Button>
            {messageTarget === 'config' && message && (
              <InlineMessage type={message.type}>{message.text}</InlineMessage>
            )}
          </div>
        </Form>

        {config.updated_at && (
          <Description style={{ marginTop: '5px', marginBottom: '30px', opacity: 0.5, fontSize: '12px' }}>
            Last updated: {new Date(config.updated_at).toLocaleString()}
          </Description>
        )}

        {/* API Keys Form */}
        <Title>API Keys</Title>
        <Description>
          Configure API keys for each LLM provider. These keys are stored locally and will be
          used automatically when you select the corresponding provider above.
        </Description>

        <Form autoComplete="off" onKeyDown={this.handleKeyDown('apiKeys')}>
          <FormGroup>
            <Label htmlFor="anthropic_key">Anthropic API Key</Label>
            <Input
              type="text"
              id="anthropic_key"
              value={apiKeys.anthropic || ''}
              onChange={e => this.handleApiKeyChange('anthropic', e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              inputMode="text"
              spellCheck={false}
              data-lpignore="true"
            />
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="openai_key">OpenAI API Key</Label>
            <Input
              type="text"
              id="openai_key"
              value={apiKeys.openai || ''}
              onChange={e => this.handleApiKeyChange('openai', e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              inputMode="text"
              spellCheck={false}
              data-lpignore="true"
            />
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="xai_key">xAI (Grok) API Key</Label>
            <Input
              type="text"
              id="xai_key"
              value={apiKeys.xai || ''}
              onChange={e => this.handleApiKeyChange('xai', e.target.value)}
              placeholder="xai-..."
              autoComplete="off"
              inputMode="text"
              spellCheck={false}
              data-lpignore="true"
            />
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="google_key">Google API Key</Label>
            <Input
              type="text"
              id="google_key"
              value={apiKeys.google || ''}
              onChange={e => this.handleApiKeyChange('google', e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              inputMode="text"
              spellCheck={false}
              data-lpignore="true"
            />
          </FormGroup>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button type="button" onClick={() => this.save('apiKeys')} disabled={loading && messageTarget === 'apiKeys'}>
              Update API Keys
            </Button>
            {messageTarget === 'apiKeys' && message && (
              <InlineMessage type={message.type}>{message.text}</InlineMessage>
            )}
          </div>
        </Form>

        {/* Maintenance */}
        <Title>Database Configuration</Title>
        <Description>
          You must configure the database connection string when launching the proxy: <br />
          <code>./dbpill --db=postgres://user:password@host:port/database</code>
        </Description>

        <Title>Maintenance</Title>
        <Description>Clear all captured query logs.</Description>
        <ActionButton
          $variant="danger"
          onClick={this.handleReset}
          disabled={resetting}
          style={{ padding: '6px 12px', fontSize: '14px', marginBottom: '40px' }}
        >
          {resetting ? <LoadingIndicator>Resetting...</LoadingIndicator> : 'Reset all ⌫'}
        </ActionButton>
      </Container>
    );
  }
} 