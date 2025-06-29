import React from 'react';

interface HighlightedToken {
  type: 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'identifier' | 'whitespace';
  value: string;
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS',
  'NULL', 'TRUE', 'FALSE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'DATABASE',
  'SCHEMA', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE',
  'CHECK', 'DEFAULT', 'COLUMN', 'ADD', 'MODIFY', 'RENAME', 'TO',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL',
  'UNION', 'INTERSECT', 'EXCEPT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IF', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'SUBSTRING', 'CONCAT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'FLOOR', 'CEIL',
  'VARCHAR', 'CHAR', 'TEXT', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'DOUBLE', 'BOOLEAN', 'BOOL',
  'DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'YEAR', 'MONTH', 'DAY',
  'HOUR', 'MINUTE', 'SECOND', 'INTERVAL', 'ZONE', 'WITH', 'WITHOUT',
  'PRECISION', 'VARYING', 'SERIAL', 'BIGSERIAL', 'SMALLSERIAL',
  'EXPLAIN', 'ANALYZE', 'VERBOSE', 'COSTS', 'BUFFERS', 'FORMAT', 'JSON'
];

const tokenize = (sql: string): HighlightedToken[] => {
  const tokens: HighlightedToken[] = [];
  let i = 0;
  
  while (i < sql.length) {
    const char = sql[i];
    
    // Skip whitespace but preserve it
    if (/\s/.test(char)) {
      let whitespace = '';
      while (i < sql.length && /\s/.test(sql[i])) {
        whitespace += sql[i];
        i++;
      }
      tokens.push({ type: 'whitespace', value: whitespace });
      continue;
    }
    
    // Comments
    if (char === '-' && sql[i + 1] === '-') {
      let comment = '';
      while (i < sql.length && sql[i] !== '\n') {
        comment += sql[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    
    if (char === '/' && sql[i + 1] === '*') {
      let comment = '';
      while (i < sql.length - 1) {
        comment += sql[i];
        if (sql[i] === '*' && sql[i + 1] === '/') {
          comment += sql[i + 1];
          i += 2;
          break;
        }
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    
    // String literals
    if (char === "'" || char === '"') {
      const quote = char;
      let string = quote;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          string += sql[i];
          i++;
          // Handle escaped quotes
          if (sql[i] === quote) {
            string += sql[i];
            i++;
            continue;
          }
          break;
        }
        string += sql[i];
        i++;
      }
      tokens.push({ type: 'string', value: string });
      continue;
    }
    
    // Numbers
    if (/\d/.test(char)) {
      let number = '';
      while (i < sql.length && /[\d.]/.test(sql[i])) {
        number += sql[i];
        i++;
      }
      tokens.push({ type: 'number', value: number });
      continue;
    }
    
    // Operators and punctuation
    if (/[+\-*/%=<>!(),.;]/.test(char)) {
      let operator = char;
      i++;
      // Handle multi-character operators
      if ((char === '<' || char === '>' || char === '!' || char === '=') && 
          sql[i] === '=') {
        operator += sql[i];
        i++;
      } else if (char === '<' && sql[i] === '>') {
        operator += sql[i];
        i++;
      }
      tokens.push({ type: 'operator', value: operator });
      continue;
    }
    
    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let identifier = '';
      while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) {
        identifier += sql[i];
        i++;
      }
      
      const isKeyword = SQL_KEYWORDS.includes(identifier.toUpperCase());
      tokens.push({ 
        type: isKeyword ? 'keyword' : 'identifier', 
        value: identifier 
      });
      continue;
    }
    
    // Any other character
    tokens.push({ type: 'identifier', value: char });
    i++;
  }
  
  return tokens;
};

const getTokenStyle = (type: HighlightedToken['type']): React.CSSProperties => {
  switch (type) {
    case 'keyword':
      return { color: '#569CD6', fontWeight: 'bold' }; // Blue
    case 'string':
      return { color: '#CE9178' }; // Orange
    case 'comment':
      return { color: '#6A9955', fontStyle: 'italic' }; // Green
    case 'number':
      return { color: '#B5CEA8' }; // Light green
    case 'operator':
      return { color: '#D4D4D4' }; // Light gray
    case 'identifier':
      return { color: '#9CDCFE' }; // Light blue
    case 'whitespace':
      return {};
    default:
      return { color: '#D4D4D4' }; // Default light gray
  }
};

export const highlightSQL = (sql: string): JSX.Element => {
  const tokens = tokenize(sql);
  
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} style={getTokenStyle(token.type)}>
          {token.value}
        </span>
      ))}
    </>
  );
}; 