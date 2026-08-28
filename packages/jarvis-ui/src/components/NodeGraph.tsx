import React from 'react'

interface Props { className?: string }

export const NodeGraph: React.FC<Props> = ({ className }) => (
  <div className={className}>NodeGraph</div>
)
