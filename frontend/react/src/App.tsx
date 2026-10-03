import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import About from './pages/About'
import Communities from './pages/Communities'
import CommunityPage from './pages/CommunityPage'
import CreateListing from './pages/CreateListing'
import DataSaver from './pages/DataSaver'
import EditProfile from './pages/EditProfile'
import Home from './pages/Home'
import Landing from './pages/Landing'
import ListingDetail from './pages/ListingDetail'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import SearchResults from './pages/SearchResults'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import './App.css'

/** Old "My Listings" links now go to your own profile. */
function MyListingsRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? `/users/${user.id}` : '/signin'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AppLayout />}>
        <Route path="/app" element={<Home />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/communities" element={<Communities />} />
        <Route path="/communities/:name" element={<CommunityPage />} />
        <Route path="/listings/new" element={<CreateListing />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/listings/:id/edit" element={<CreateListing />} />
        <Route path="/users/:id" element={<Profile />} />
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/my-listings" element={<MyListingsRedirect />} />
        <Route path="/categories" element={<Navigate to="/search" replace />} />
        <Route path="/data-saver" element={<DataSaver />} />
        <Route path="/about" element={<About />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
