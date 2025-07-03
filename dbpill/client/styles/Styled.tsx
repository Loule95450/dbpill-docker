import styled from 'styled-components';

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background-color: rgba(45, 45, 45, 1);
`;

export const TableRow = styled.tr`
  background-color: rgba(45, 45, 45, 1);
  &:nth-child(even) {
    background-color: rgba(50, 50, 50, 1);
  }
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

export const TableData = styled.td`
  padding: 12px;
  line-height: 1.2em;
  max-width: 20vw;
  vertical-align: top;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
`;

export const QueryStats = styled.div`
  display: flex;
  flex-direction: column;
  text-align: left;
`;

export const QueryStat = styled.div`
  padding: 0 2px 2px 2px;
`;

export const QueryText = styled.div<{ $expanded?: boolean }>`
  text-align: left;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  padding: 12px;
  margin: 0;
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  
  ${props => !props.$expanded && `
    max-height: 200px;
    overflow: hidden;
    position: relative;
    
    &:hover {
      border-color: rgba(255, 255, 255, 0.3);
    }
  `}

  ${props => props.$expanded && `
    max-height: none;
  `}
`;

export const QueryExpandHint = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
  font-style: italic;
`;

export const QuerySort = styled.span`
  user-select: none;
`;

export const QuerySortOption = styled.span<{ $active?: string }>`
  cursor: pointer;
  display: inline-block;
  margin: 0 5px;
  padding: 0 5px;
  line-height: 20px;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);

  &:hover {
    box-shadow: 0 2px 0 0 rgba(255, 255, 255, 0.5);
    color: #fff;
  }

  ${props => props.$active && `
    box-shadow: 0 2px 0 0 #ffa;
    color: #ffa;

    &:hover {
      box-shadow: 0 2px 0 0 #ffa;
      color: #ffa;
    }

  `}
`;

export const RowIndex = styled.span`
  opacity: 0.2;
  font-size: 1.2em;
`;

export const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ai-suggestion' }>`
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  margin: 0;
  line-height: 1.2;
  min-width: 70px;
  transition: all 0.15s ease;
  border-radius: 0;
  font-family: "Inconsolata", monospace;
  
  ${props => props.$variant === 'primary' && `
    border-color: #6366f1;
    color: #6366f1;
    
    &:hover {
      background: rgba(99, 102, 241, 0.1);
      border-color: #8b5cf6;
      color: #8b5cf6;
    }
  `}

  ${props => props.$variant === 'ai-suggestion' && `
    border-color:rgb(215, 184, 255);
    background: rgba(215, 184, 255, 0.1);
    color:rgb(215, 184, 255);
    padding: 12px 20px;
    font-size: 16px;
    min-width: 140px;
    font-weight: 600;
    width: auto;
    flex-shrink: 0;
    
    &:hover {
      background: rgba(215, 184, 255, 0.1);
      border-color:rgb(255, 255, 255);
      color:rgb(255, 255, 255);
    }
  `}

  ${props => props.$variant === 'success' && `
    border-color:rgb(73, 202, 159);
    color: rgb(73, 202, 159);
    
    &:hover {
      background: rgba(16, 185, 129, 0.1);
    }
  `}

  ${props => props.$variant === 'danger' && `
    border-color: rgb(255, 150, 150);
    color:rgb(255, 150, 150);
    
    &:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  `}

  ${props => (!props.$variant || props.$variant === 'secondary') && `
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
    
    &:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.4);
      color: rgba(255, 255, 255, 1);
    }
  `}
  
  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.4);
  }
`;

export const StatsCard = styled.div`
  background: rgba(30, 30, 30, 1);
  border-radius: 0;
  padding: 12px;
  margin-bottom: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

export const StatsGrid = styled.div`
  width: 200px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px 16px;
  margin-bottom: 8px;
`;

export const StatItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  
  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
`;

export const StatLabel = styled.span`
  color: rgba(255, 255, 255, 0.6);
`;

export const StatValue = styled.span<{ $trend?: 'up' | 'down' | 'neutral' }>`
  
  ${props => props.$trend === 'up' && `
    color: #10B981;
  `}
  
  ${props => props.$trend === 'down' && `
    color: #EF4444;
  `}
  
  ${props => (!props.$trend || props.$trend === 'neutral') && `
    color: rgba(255, 255, 255, 0.9);
  `}
`;

export const PerformanceBadge = styled.div<{ $improvement: number }>`
  display: inline-block;
  line-height: 2em;
  padding: 0 10px;
  border-radius: 5px;
  white-space: nowrap;

  ${props => props.$improvement > 5.0 && `
    color:rgb(72, 255, 142);
    text-shadow: 0 0 5px rgba(72, 255, 142, 1);
  `}

  ${props => props.$improvement > 2.0 && `
    color:rgb(72, 255, 142);
  `}
  
  ${props => props.$improvement < 0.8 && `
    color: #EF4444;
  `}
  
  ${props => props.$improvement >= 0.8 && props.$improvement <= 2.0 && `
    color: #F59E0B;
  `}
`;

export const TableContainer = styled.div`
  display: flex;
  margin-top: 20px;
  flex-direction: column;
  gap: 15px;
`;

export const QueryCard = styled.div`
  display: flex;
  border-radius: 10px 10px 0 0;
  box-shadow: 0 3px 5px 0 rgba(0, 0, 0, 0.5);
  overflow: hidden;
`;

export const QuerySection = styled.div`
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 150px;
`;

export const QueryContentSection = styled(QuerySection)`
 padding-bottom: 0;
  background: rgba(45, 45, 45, 1);
`;

export const QueryStatsSection = styled(QuerySection)`
  background: rgba(40, 40, 40, 1);
`;

export const QueryActionsSection = styled(QuerySection)`
  background: rgba(45, 45, 45, 1);
  align-items: center;
  justify-content: center;
`;

export const StatusTag = styled.div<{ $status: 'suggested' | 'applied' | 'reverted' }>`
  display: inline-block;
  
  ${props => props.$status === 'suggested' && `
    color:rgb(152, 192, 255);
  `}
  
  ${props => props.$status === 'applied' && `
    color:rgb(110, 215, 180);
  `}
  
  ${props => props.$status === 'reverted' && `
    color:rgb(248, 113, 113);
  `}
`;

export const QueryIndex = styled.div`
  width: 20px;
  height: 32px;
  color: rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
`;

export const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

export const SuggestionContent = styled.div<{ $status: 'suggested' | 'applied' | 'reverted' }>`
  background: ${props => 
    props.$status === 'applied' ? 'rgba(16, 185, 129, 0.2)' :
    props.$status === 'reverted' ? 'rgba(239, 68, 68, 0.2)' :
    'rgba(59, 130, 246, 0.2)'
  };
  padding: 12px;
  margin-bottom: 12px;
  flex-grow: 1;
  width: 100%;
  box-sizing: border-box;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
`;

export const HighlightedSQL = styled.div`
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
`;

export const Block = styled.div`
  padding: 10px;
  background-color: rgba(45, 45, 45, 1);
  color: rgba(255, 255, 255, 0.9);
  
  & h1, & h2, & h3, & h4 {
    color: #fff;
  }
  
  & pre {
    background-color: rgba(30, 30, 30, 1);
    color: rgba(255, 255, 255, 0.9);
    padding: 10px;
  }
`;

export const LoadingIndicator = styled.div`
  display: inline-block;
  animation: loading-indicator 1s infinite linear;
  @keyframes loading-indicator {
    0% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 0; }
  }
`;

export const SuggestionsApplied = styled.div`
  color: rgba(100, 255, 100, 0.8);
  margin-bottom: 10px;
`;

export const GlobalStats = styled.div`
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
  text-align: right;
`;

export const StatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  display: inline-block;
  background-color: rgba(35, 35, 35, 1);
`;

export const StatRow = styled.tr``;

export const StatHeader = styled.th`
  text-align: left;
  color: rgba(255, 255, 255, 0.8);
`;

export const StatCell = styled.td`
  color: rgba(255, 255, 255, 0.9);
`;

export const StatsTable = styled.table`
  width: max-content;
  border-collapse: collapse;
`;

export const StatsTableBody = styled.tbody``;

export const StatsTableRow = styled.tr``;

export const StatsTableLabelCell = styled.td`
  padding: 3px 8px;
  color: rgba(255, 255, 255, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
`;

export const StatsTableValueCell = styled.td`
  padding: 3px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
`;

export const StatsTableActionCell = styled.td`
  padding: 3px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
`;

export const StatsTableHeaderCell = styled.td`
  padding: 6px 8px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  font-weight: bold;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.02);
`;

export const StatsTableImprovementCell = styled.td`
  padding: 3px 8px;
  vertical-align: middle;
`;

export const SuggestionTitleBar = styled.div<{ $status: 'suggested' | 'applied' | 'reverted' }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: ${props => 
    props.$status === 'applied' ? 'rgba(16, 185, 129, 0.37)' :
    props.$status === 'reverted' ? 'rgba(239, 68, 68, 0.35)' :
    'rgba(59, 131, 246, 0.35)'
  };
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  width: 100%;
  box-sizing: border-box;
`;

export const SuggestionTitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  
  /* Remove bottom margin from StatusTag when used inline */
  ${StatusTag} {
    margin-bottom: 0;
  }
`;

export const SuggestionActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`;

export const DeleteSuggestionButton = styled.div`
  position: absolute;
  top: -10px;
  right: -10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background-color: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
  
  &:hover {
    background-color: #ff6666;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #666;
  }
`;

export const SuggestionContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-self: stretch;
  box-sizing: border-box;
  position: relative;
  
  &:hover ${DeleteSuggestionButton} {
    opacity: 1;
  }
`; 


export const NumUnit = styled.span`
  color: rgba(255, 255, 255, 0.5);
`;

export const QueryDetailsBottomBar = styled.div`
  display: flex;
  width: 100%;
  background: rgba(35, 35, 35, 1);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  box-shadow: 0 3px 5px 0 rgba(0, 0, 0, 0.5);
`;

export const QueryDetailsBottomBarSection = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 5px;
  font-size: 11px;
  user-select: none;
`;

export const QueryDetailsTabButton = styled.button<{ $active?: boolean }>`
  background: none;
  font-family: "Inconsolata", monospace;
  font-size: 14px;
  border: none;
  cursor: pointer;
  padding: 0 10px;
  color: ${props => (props.disabled ? 'rgba(255, 255, 255, 0.25)' : props.$active ? '#fff' : 'rgba(255, 255, 255, 0.6)')};

  line-height: 40px;

  ${props => props.$active && `
    background: #000;
  `}

  &:hover {
    color: ${props => (props.disabled ? 'rgba(255, 255, 255, 0.25)' : '#fff')};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }
`;

export const QueryDetailsPanel = styled.div`
  background: #000;
  padding: 12px 20px;
  margin: 0 10px;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
`;

export const ExpandArrow = styled.span`
  color: rgba(255, 255, 255, 0.3);
`;

// QueryDetailsBar specific components
export const InstanceTypeContainer = styled.div`
  margin-bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

export const InstanceTypeLabel = styled.span`
  font-weight: bold;
`;

export const InstanceTypeSelect = styled.select`
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #333;
  background-color: #1a1a1a;
  color: white;
`;

export const TableItemContainer = styled.div`
  margin-bottom: 1rem;
`;

export const TableDefinitionPre = styled.pre`
  white-space: pre-wrap;
  margin-top: 0.5rem;
`;



export const FullWidthStatsTable = styled(StatsTable)`
  width: 100%;
`;

export const ParameterCell = styled(StatsTableLabelCell)`
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const CompactActionButton = styled(ActionButton)`
  background-color: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  min-width: 60px;
`;

export const ShowMoreContainer = styled.div`
  margin-top: 1rem;
  text-align: center;
`;

export const ShowMoreButton = styled(ActionButton)`
  padding: 8px 16px;
`;

export const PromptContainer = styled.div`
  position: relative;
  width: 100%;
`;

export const PromptTitle = styled.h2`
  margin: 0;
`;

export const EditedIndicator = styled.span`
  color: #ff9500;
  font-size: 0.8em;
  margin-left: 8px;
`;

export const PromptActionGroup = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 8px;
`;

export const PromptActionButton = styled(ActionButton)`
  padding: 4px 8px;
`;

export const PromptTextarea = styled.textarea`
  width: 100%;
  min-height: 300px;
  background-color: #1a1a1a;
  color: white;
  border: 1px solid #333;
  padding: 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: "Inconsolata", monospace;
`;

export const ContentPre = styled.pre`
  white-space: pre-wrap;
`;