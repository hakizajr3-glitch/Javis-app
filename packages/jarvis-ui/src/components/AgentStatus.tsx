import React from 'react'

interface Props { status?: string; className?: string }

export const AgentStatus: React.FC<Props> = ({ status, className }) => (
  <div className={className}>AgentStatus: {status}</div>
)
