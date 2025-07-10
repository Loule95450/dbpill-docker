import styled from 'styled-components';

const AboutContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
  
  h1 {
    margin-bottom: 20px;
    color: color(display-p3 0.964 0.7613 0.3253);
  }
  
  h2 {
    margin-top: 30px;
    margin-bottom: 15px;
    color: #fff;
  }
  
  p {
    margin-bottom: 15px;
    color: rgba(255, 255, 255, 0.9);
  }
  
  a {
    color: color(display-p3 0.964 0.7613 0.3253);
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  ul {
    margin-bottom: 15px;
    padding-left: 20px;
    
    li {
      margin-bottom: 8px;
      color: rgba(255, 255, 255, 0.9);
    }
  }
`;

export function About() {
  return (
    <AboutContainer>
      <h1>About dbpill</h1>
      
      <p>
        dbpill is a PostgreSQL query performance monitoring and optimization tool 
        that uses AI to automatically suggest database indexes to improve query performance.
      </p>
      
      <h2>Features</h2>
      <ul>
        <li>Real-time query performance monitoring</li>
        <li>AI-powered index suggestions using large language models</li>
        <li>One-click index application and reversion</li>
        <li>Query execution time comparison</li>
        <li>Transparent proxy between your application and PostgreSQL</li>
      </ul>
      
      <h2>How it works</h2>
      <p>
        dbpill acts as a transparent proxy between your application and PostgreSQL database. 
        It captures and analyzes SQL queries, then uses AI to suggest optimal indexes 
        that can significantly improve query performance.
      </p>
      
      <h2>Contact & Support</h2>
      <p>
        <strong>Website:</strong> <a href="https://dbpill.com">dbpill.com</a><br />
        <strong>Email:</strong> <a href="mailto:help@dbpill.com">help@dbpill.com</a><br/>
        <strong>Author:</strong> <a href="https://x.com/mayfer" target="_blank" rel="noopener noreferrer">@mayfer</a>
      </p>
      
      <p>
        For bug reports, feature requests, or general questions, please reach out via email.
      </p>
    </AboutContainer>
  );
} 