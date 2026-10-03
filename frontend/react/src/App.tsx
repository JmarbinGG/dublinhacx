import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import Home from './pages/Home'
import Landing from './pages/Landing'

// Home and the landing page ship in the first load; every other route is
// its own chunk, fetched the first time it's visited (then cached by the
// service worker).
const About = lazy(() => import('./pages/About'))
const Communities = lazy(() => import('./pages/Communities'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const CreateListing = lazy(() => import('./pages/CreateListing'))
const DataSaver = lazy(() => import('./pages/DataSaver'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const ListingDetail = lazy(() => import('./pages/ListingDetail'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Profile = lazy(() => import('./pages/Profile'))
const SearchResults = lazy(() => import('./pages/SearchResults'))
const SignIn = lazy(() => import('./pages/SignIn'))
const SignUp = lazy(() => import('./pages/SignUp'))

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
