import { useState, useEffect, useContext } from 'react';
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

export function Configs() {
  const { config, updateConfig } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    llm_endpoint: '',
    llm_model: '',
    llm_api_key: ''
  });
  const [endpointType, setEndpointType] = useState<'anthropic' | 'openai' | 'gemini' | 'grok' | 'custom'>('anthropic');
  const [customUrl, setCustomUrl] = useState('');

  // Update form when config changes
  useEffect(() => {
    if (config) {
      // Determine endpoint type and custom URL from loaded data
      const endpoint = config.llm_endpoint || '';
      if (endpoint === 'anthropic' || endpoint === 'openai' || endpoint === 'gemini' || endpoint === 'grok') {
        setEndpointType(endpoint);
        setCustomUrl('');
      } else {
        setEndpointType('custom');
        setCustomUrl(endpoint);
      }
      
      setFormData({
        llm_endpoint: config.llm_endpoint || '',
        llm_model: config.llm_model || '',
        llm_api_key: config.llm_api_key || ''
      });
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Use the appropriate endpoint value based on type
      const submitData = {
        ...formData,
        llm_endpoint: endpointType === 'custom' ? customUrl : endpointType
      };

      await updateConfig(submitData);
      setMessage({ type: 'success', text: 'Configuration updated successfully' });
    } catch (error) {
      console.error('Error updating config:', error);
      setMessage({ type: 'error', text: 'Failed to update configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEndpointTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as 'anthropic' | 'openai' | 'gemini' | 'grok' | 'custom';
    setEndpointType(newType);
    if (newType !== 'custom') {
      setCustomUrl('');
    } else if (!customUrl) {
      setCustomUrl('https://');
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to clear all query logs? This action cannot be undone.')) {
      return;
    }
    setResetting(true);
    try {
      await adminApi.resetQueryLogs();
      alert('Query logs have been cleared.');
    } catch (error: any) {
      console.error('Error resetting query logs:', error);
      alert(error.message || 'Failed to reset query logs');
    } finally {
      setResetting(false);
    }
  };

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
        These settings will override command-line arguments and persist across restarts.
      </Description>

      {message && (
        <Message type={message.type}>
          {message.text}
        </Message>
      )}

      <Form onSubmit={handleSubmit} autoComplete="off">
        <FormGroup>
          <Label htmlFor="llm_endpoint_type">LLM Endpoint</Label>
          <Select
            id="llm_endpoint_type"
            name="llm_endpoint_type"
            value={endpointType}
            onChange={handleEndpointTypeChange}
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
              name="custom_url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
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
            onChange={handleInputChange}
            placeholder="claude-sonnet-4, gpt-4, o3, etc."
            required
          />
          <HelpText>Specify the model name/identifier for the LLM service</HelpText>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="llm_api_key">API Key</Label>
          <Input
            type="text"
            id="llm_api_key"
            name="llm_api_key"
            value={formData.llm_api_key}
            onChange={handleInputChange}
            placeholder="Leave empty to use CLI argument or environment variable"
            autoComplete="off"
            inputMode="text"
            spellCheck={false}
            data-lpignore="true"
          />
          <HelpText>Optional: API key for the LLM service (stored securely)</HelpText>
        </FormGroup>

        <Button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update Configuration'}
        </Button>
      </Form>

      {config.updated_at && (
        <Description style={{ marginTop: '5px', marginBottom: '30px', opacity: 0.5, fontSize: '12px' }}>
          Last updated: {new Date(config.updated_at).toLocaleString()}
        </Description>
      )}

      <Title>Database Configuration</Title>
      <Description>You must configure the database connection string when launching the proxy: <br /><code>./dbpill --db=postgres://user:password@host:port/database</code></Description>

      <Title>Maintenance</Title>
      <Description>Clear all captured query logs.</Description>
      <ActionButton
        $variant="danger"
        onClick={handleReset}
        disabled={resetting}
        style={{ padding: '6px 12px', fontSize: '14px', marginBottom: '40px' }}
      >
        {resetting ? <LoadingIndicator>Resetting...</LoadingIndicator> : 'Reset all ⌫'}
      </ActionButton>
    </Container>
  );
} 