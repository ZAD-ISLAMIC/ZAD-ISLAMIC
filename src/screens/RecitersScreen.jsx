import React from 'react'
import { useNavigate } from 'react-router-dom'
import { RecitersList } from '../components/reciters/RecitersList.jsx'

export default function RecitersScreen() {
  const navigate = useNavigate()
  return <RecitersList onOpen={(id) => navigate(`/reciters/${id}`)} />
}