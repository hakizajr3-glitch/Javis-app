import React from 'react'

interface Props { className?: string }

export const StatusBar: React.FC<Props> = ({ className }) => (
  <div className={className}>StatusBar</div>
)
