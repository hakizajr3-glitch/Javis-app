import React from 'react'

interface Props { className?: string; onSend?: (text: string) => void }

export const CommandInput: React.FC<Props> = ({ className, onSend }) => (
  <div className={className}>
    <input type="text" placeholder="Type a command..." />
    <button onClick={() => onSend?.('')}>Send</button>
  </div>
)
