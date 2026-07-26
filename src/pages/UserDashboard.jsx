import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Clock, User as UserIcon, ChevronLeft, Bell, Calendar, MapPin, Wrench, Plus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useProperties } from '../hooks/useProperties'
import { PropertyCard } from '../components/property/PropertyCard'
import { supabase } from '../lib/supabase'
import { MOCK_PROPERTIES } from '../utils/constants'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import toast from 'react-hot-toast'

export const UserDashboard = () => {
  const { user, profile } = useAuth()
  const { favorites, recentlyViewed } = useProperties()
  const [favProps, setFavProps] = useState([])
  const [recentProps, setRecentProps] = useState([])
  const [loading, setLoading] = useState(true)

  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [myVisits, setMyVisits] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  // Maintenance Tickets
  const [tickets, setTickets] = useState([])
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', property_id: '' })
  const [submittingTicket, setSubmittingTicket] = useState(false)

  useEffect(() => {
    if (user) {
      loadProperties()
      loadUserData()
      loadTickets()

      // Realtime subscription for tickets
      const ticketsSub = supabase.channel('tenant_tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets', filter: `tenant_id=eq.${user.id}` }, payload => {
          if (payload.eventType === 'INSERT') {
             // We can ignore or prepend it, but it might lack relations unless we fetch them
             loadTickets()
          } else if (payload.eventType === 'UPDATE') {
             setTickets(prev => prev.map(t => t.id === payload.new.id ? { ...t, status: payload.new.status } : t))
          }
        })
        .subscribe()

      return () => {
        supabase.removeChannel(ticketsSub)
      }
    }
  }, [user, favorites, recentlyViewed]) // React to changes in the Redux IDs

  const loadUserData = async () => {
    if (!user) return
    try {
      setLoadingData(true)
      const [notifRes, visitRes] = await Promise.all([
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('site_visits').select('*, property:properties(id, title, landlord_id, city)').eq('user_id', user.id).order('created_at', { ascending: false })
      ])
      
      if (!notifRes.error) setNotifications(notifRes.data || [])
      if (!visitRes.error) setMyVisits(visitRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingData(false)
    }
  }

  const loadTickets = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*, property:properties(title)')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setTickets(data)
  }

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!ticketForm.property_id || !ticketForm.title || !ticketForm.description) {
      toast.error('Please fill all fields')
      return
    }

    // Find landlord_id from the selected property's site visit
    const visit = myVisits.find(v => v.property_id === ticketForm.property_id)
    if (!visit || !visit.property) {
      toast.error('Invalid property selected')
      return
    }

    setSubmittingTicket(true)
    try {
      const { error } = await supabase.from('maintenance_tickets').insert({
        property_id: ticketForm.property_id,
        tenant_id: user.id,
        landlord_id: visit.property.landlord_id,
        title: ticketForm.title,
        description: ticketForm.description
      })
      if (error) throw error
      toast.success('Ticket submitted successfully')
      setShowTicketModal(false)
      setTicketForm({ title: '', description: '', property_id: '' })
      loadTickets()
    } catch (err) {
      console.error(err)
      toast.error('Failed to submit ticket')
    } finally {
      setSubmittingTicket(false)
    }
  }

  const markAsRead = async () => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
      setNotifications(prev => prev.map(n => ({...n, is_read: true})))
    } catch (err) {
      console.error(err)
    }
  }
  
  const unreadCount = notifications.filter(n => !n.is_read).length

  const loadProperties = async () => {
    if (!user) return
    
    // Only set loading if we don't have any data yet
    if (favProps.length === 0 && recentProps.length === 0) {
      setLoading(true)
    }

    try {
      // Fetch details for favorited ids
      if (favorites.length > 0) {
        const { data } = await supabase.from('properties').select('*').in('id', favorites)
        if (data) {
           // preserve order based on favorites array
           const ordered = favorites.map(id => data.find(p => p.id === id)).filter(Boolean)
           setFavProps(ordered)
        }
      } else {
        setFavProps([])
      }

      // Fetch details for recently viewed ids
      if (recentlyViewed.length > 0) {
        const { data } = await supabase.from('properties').select('*').in('id', recentlyViewed)
        if (data) {
          // preserve order based on recentlyViewed array
          const ordered = recentlyViewed.map(id => data.find(p => p.id === id)).filter(Boolean)
          setRecentProps(ordered)
        }
      } else {
        setRecentProps([])
      }
    } catch (err) {
      console.error('[UserDashboard] Load error:', err)
      // Fallback
      setFavProps(MOCK_PROPERTIES.filter(p => favorites.includes(p.id)))
      setRecentProps(recentlyViewed.map(id => MOCK_PROPERTIES.find(p => p.id === id)).filter(Boolean))
    } finally {
      setLoading(false)
    }
  }

  const LoadingRow = () => (
    <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex-shrink-0 w-64 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 space-y-3">
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="space-y-2 px-1">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <div className="pt-1 flex gap-2">
              <Skeleton className="h-3 w-1/4 rounded-full" />
              <Skeleton className="h-3 w-1/4 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="pt-4 pb-20 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-10 w-full relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-brand-200 bg-gray-200 shadow-sm flex-shrink-0">
              {profile ? (
                <img src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Skeleton variant="circle" className="w-full h-full" />
              )}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-display leading-tight">
                {profile ? `Hi, ${profile?.full_name?.split(' ')[0] || 'User'}!` : <Skeleton className="h-8 w-32" />}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Pick up exactly where you left off.</p>
            </div>
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`p-2 text-yellow-500 hover:text-yellow-600 transition-all relative cursor-pointer active:scale-95`}
            >
              <Bell size={24} className="fill-current" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm ring-2 ring-red-500/20 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
               <div className="absolute top-full right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.1)] border border-gray-100 dark:border-gray-700 p-4 z-50">
                 <div className="flex items-center justify-between mb-3 border-b border-gray-50 dark:border-gray-700 pb-2">
                   <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                   {unreadCount > 0 && <button onClick={markAsRead} className="text-xs font-bold text-[#CA3433] hover:underline px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Mark all read</button>}
                 </div>
                 <div className="space-y-3 max-h-80 overflow-y-auto pr-1 customize-scrollbar">
                   {notifications.length === 0 ? (
                     <div className="text-center py-6">
                       <Bell size={24} className="mx-auto text-gray-300 mb-2" />
                       <p className="text-sm text-gray-500 font-medium">No notifications yet</p>
                     </div>
                   ) : (
                     notifications.map(n => (
                       <div key={n.id} className={`p-3 rounded-xl border transition-colors ${n.is_read ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400' : 'bg-[#fffcf0] dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/50 text-gray-900 dark:text-yellow-100'}`}>
                         <p className={`text-[13px] leading-relaxed ${n.is_read ? 'font-medium' : 'font-semibold'}`}>{n.message}</p>
                         <p className="text-[10px] mt-2 text-gray-400 font-bold uppercase tracking-wider">{new Date(n.created_at).toLocaleDateString()}</p>
                       </div>
                     ))
                   )}
                 </div>
               </div>
            )}
          </div>
        </div>

        {/* Saved Properties */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Heart size={24} className="text-[#CA3433]" fill="currentColor" />
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white font-display leading-none">Saved Properties</h2>
                {!loading && <span className="text-xs font-bold text-gray-400 mt-1 block uppercase tracking-wider">{favProps.length} Items</span>}
              </div>
            </div>
            
            {favProps.length > 0 && (
              <Link 
                to="/dashboard/saved" 
                className="text-sm font-extrabold text-[#CA3433] hover:underline flex items-center gap-1 group"
              >
                View all
                <ChevronLeft size={16} className="rotate-180 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>

          {loading ? (
            <LoadingRow />
          ) : favProps.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl border border-gray-100 dark:border-gray-700 text-center shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-4">You haven't saved any properties yet.</p>
              <Link to="/search" className="bg-[#fdf2f2] dark:bg-red-900/20 text-[#CA3433] px-6 py-2.5 rounded-xl font-bold hover:bg-[#fbe1e1] dark:hover:bg-red-900/40 transition-colors inline-block">Explore listings</Link>
            </div>
          ) : (
            <div className="scroll-row px-1 -mx-1">
              {favProps.slice(0, 3).map(p => (
                <div key={p.id} className="flex-shrink-0">
                  <PropertyCard property={p} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Viewed */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={24} className="text-[#CA3433]" />
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white font-display leading-none">Recently Viewed</h2>
              <p className="text-[10px] text-gray-400 mt-1 font-medium bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md inline-block">
                Auto-clears after 72 hours
              </p>
            </div>
          </div>

          {loading ? (
            <LoadingRow />
          ) : recentProps.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl border border-gray-100 dark:border-gray-700 text-center shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 font-medium">No recently viewed properties.</p>
            </div>
          ) : (
            <div className="scroll-row px-1 -mx-1">
              {recentProps.map(p => (
                <div key={p.id} className="flex-shrink-0">
                  <PropertyCard property={p} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Site Visits */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Calendar size={24} className="text-orange-500" />
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white font-display leading-none">My Site Visits</h2>
              {!loadingData && <span className="text-[10px] text-gray-400 mt-1 font-medium bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md inline-block uppercase tracking-wider">
                {myVisits.length} Requests
              </span>}
            </div>
          </div>

          {loadingData ? (
             <LoadingRow />
           ) : myVisits.length === 0 ? (
             <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl border border-gray-100 dark:border-gray-700 text-center shadow-sm">
               <Calendar size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
               <p className="text-gray-500 dark:text-gray-400 font-medium font-display">You haven't requested any site visits.</p>
             </div>
          ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {myVisits.map(visit => (
                 <div key={visit.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-3 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_4px_16px_rgb(0,0,0,0.05)] transition-all cursor-pointer" onClick={() => navigate(`/property/${visit.property_id}`)}>
                   <div className="flex justify-between items-start">
                     <div className="pr-2">
                       <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1 text-[15px] hover:text-[#CA3433] transition-colors">{visit.property?.title || 'Property Unavaliable'}</h3>
                       <p className="text-[13px] text-gray-500 mt-1 flex items-center gap-1"><MapPin size={12} className="text-gray-400"/>{visit.property?.city || 'Unknown'}</p>
                     </div>
                     <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest border ${visit.status === 'approved' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : visit.status === 'declined' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'}`}>
                       {visit.status}
                     </span>
                   </div>
                   <div className="pt-3 border-t border-gray-50 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 font-semibold bg-gray-50/50 dark:bg-gray-800 rounded-lg p-2">
                     <Calendar size={14} className="text-gray-400" />
                     {new Date(visit.visit_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                   </div>
                 </div>
               ))}
             </div>
          )}
        </div>

        {/* Maintenance Tickets */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Wrench size={24} className="text-blue-500" />
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white font-display leading-none">Maintenance Requests</h2>
                <span className="text-[10px] text-gray-400 mt-1 font-medium bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md inline-block uppercase tracking-wider">
                  {tickets.length} Tickets
                </span>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowTicketModal(true)} leftIcon={<Plus size={16} />}>New Request</Button>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl border border-gray-100 dark:border-gray-700 text-center shadow-sm">
              <Wrench size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium font-display">You have no active maintenance tickets.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map(ticket => (
                <div key={ticket.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-900 dark:text-white">{ticket.title}</h3>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${
                      ticket.status === 'Resolved' ? 'bg-green-50 text-green-700 border-green-200' : 
                      ticket.status === 'In-Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                      'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{ticket.property?.title}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800">{ticket.description}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-4">
                    Reported on {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* New Ticket Modal */}
      <Modal open={showTicketModal} onClose={() => setShowTicketModal(false)} title="New Maintenance Request">
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Select Property</label>
            <select 
              value={ticketForm.property_id}
              onChange={e => setTicketForm({...ticketForm, property_id: e.target.value})}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#CA3433] focus:border-transparent outline-none transition-all dark:text-white"
              required
            >
              <option value="" disabled>Select a property...</option>
              {myVisits.filter(v => v.status === 'approved').map(v => (
                <option key={v.property_id} value={v.property_id}>{v.property?.title}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Only properties with approved site visits are listed.</p>
          </div>
          <Input 
            label="Issue Title" 
            placeholder="e.g. Leaking faucet in bathroom"
            value={ticketForm.title}
            onChange={e => setTicketForm({...ticketForm, title: e.target.value})}
            required
          />
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#CA3433] focus:border-transparent outline-none transition-all dark:text-white min-h-[120px] resize-y"
              placeholder="Describe the issue in detail..."
              value={ticketForm.description}
              onChange={e => setTicketForm({...ticketForm, description: e.target.value})}
              required
            />
          </div>
          <div className="pt-2">
            <Button type="submit" variant="primary" className="w-full" isLoading={submittingTicket}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
