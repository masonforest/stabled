
function SideNav() {

    return <>
     <div className="sidenav">
       <div className="offcanvas offcanvas-start" tabIndex="-1" id="offcanvasSidenav">
        <div className="offcanvas-header bg-dark border-bottom border-light">
           <div className="hstack gap-3">
               <div className="">
               </div>
               <div className="details">
                 <h6 className="mb-0 text-white">Hi! Jhon Deo</h6>
               </div>
           </div>
          <div data-bs-dismiss="offcanvas"><i className="bi bi-x-lg fs-5 text-white"></i></div>
        </div>
        <div className="offcanvas-body p-0">
          <nav className="sidebar-nav">
            <ul className="metismenu" id="sidenav">
              <li>
                <a href="home.html">
                   <i className="bi bi-house-door me-2"></i>
                    Send
                 </a>
              </li>
              <li>
                <a className="has-arrow" href="#">
                  <i className="bi bi-person-circle me-2"></i>
                    Receive
                </a>
                <ul>
                  <li><a href="profile.html">Profile</a></li>
                  <li><a href="my-orders.html">My Orders</a></li>
                  <li><a href="my-profile.html">My Profile</a></li>
                  <li><a href="addresses.html">Addresses</a></li>
                  <li><a href="notification.html">Notification</a></li>
                </ul>
              </li>
              <li>
                <a className="has-arrow" href="">
                   <i className="bi bi-basket3 me-2"></i>
                   Shop Pages
                 </a>
                <ul>
                  <li><a href="shop.html">Shop</a></li>
                  <li><a href="cart.html">Cart</a></li>
                  <li><a href="wishlist.html">Wishlist</a></li>
                  <li><a href="product-details.html">Product Details</a></li>
                  <li><a href="checkout.html">Checkout</a></li>
                  <li><a href="order-tracking.html">Order Tracking</a></li>
                </ul>
              </li>
              <li>
                <a className="has-arrow" href="#">
                   <i className="bi bi-credit-card me-2"></i>
                   Payment
                 </a>
                <ul>
                  <li><a href="payment-method.html">Payment Method</a></li>
                  <li><a href="payment-error.html">Payment Error</a></li>
                  <li><a href="payment-completed.html">Payment Completed</a></li>
                </ul>
              </li>
              <li>
                <a className="has-arrow" href="#">
                   <i className="bi bi-grid me-2"></i>
                   Category
                 </a>
                <ul>
                  <li><a href="category-grid.html">Category Grid</a></li>
                  <li><a href="category-list.html">Category List</a></li>
                </ul>
              </li>
              <li>
                <a className="has-arrow" href="#">
                   <i className="bi bi-lock me-2"></i>
                   Authentication
                 </a>
                <ul>
                  <li><a href="authentication-log-in.html">Log In</a></li>
                  <li><a href="authentication-sign-up.html">Sign Up</a></li>
                  <li><a href="authentication-otp-varification.html">Verification</a></li>
                  <li><a href="authentication-change-password.html">Change Password</a></li>
                  <li><a href="authentication-splash.html">Splash</a></li>
                  <li><a href="authentication-splash-2.html">Splash 2</a></li>
                </ul>
              </li>
              <li>
                <a className="has-arrow" href="#">
                   <i className="bi bi-star me-2"></i>
                   Customer Reviews
                 </a>
                <ul>
                  <li><a href="reviews-and-ratings.html">Ratings & Reviews</a></li>
                  <li><a href="write-a-review.html">Write a Review</a></li>
                </ul>
              </li>
              <li>
                <a href="about-us.html">
                   <i className="bi bi-emoji-smile me-2"></i>
                   About Us
                 </a>
              </li>
              <li>
                <a href="contact-us.html">
                   <i className="bi bi-headphones me-2"></i>
                   Contact Us
                 </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="offcanvas-footer border-top p-3">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" role="switch" id="DarkMode" />
            <label className="form-check-label" htmlFor="DarkMode">Dark Mode</label>
          </div>
        </div>
      </div>
    </div>
   </>
   }

   export default SideNav