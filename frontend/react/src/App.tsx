import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import About from './pages/About'
import Categories from './pages/Categories'
import CreateListing from './pages/CreateListing'
import Home from './pages/Home'
import Landing from './pages/Landing'
import ListingDetail from './pages/ListingDetail'
import MyListings from './pages/MyListings'
import NotFound from './pages/NotFound'
import SearchResults from './pages/SearchResults'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AppLayout />}>
        <Route path="/app" element={<Home />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/listings/new" element={<CreateListing />} />
        <Route path="/my-listings" element={<MyListings />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
