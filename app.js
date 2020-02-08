require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const mongoose = require("mongoose");
const lodash = require("lodash");
const session = require("express-session");
const MemoryStore = require('session-memory-store')(session);
const findOrCreate = require("mongoose-findorcreate");
const flash = require("connect-flash");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(flash());
app.set("trust proxy", 1);

const options = {
  expires:  60 * 60 * 12,
  checkperiod: 10 * 60
};

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  store: new MemoryStore(options)
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/LibraryManagementDB", { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false}).then(function(){
  console.log("DB Started");
}).catch(function(err){
  console.log(err);
});

mongoose.set("useCreateIndex", true);

const user = new mongoose.Schema({
  first_name: String,
  last_name: String,
  email: String,
  member_type: String,
  googleId: String,
  faceBookId: String,
  twitterId: String,
  loggedInTime: String
});
user.plugin(passportLocalMongoose,{ usernameField: 'email' });
user.plugin(findOrCreate);

const User = mongoose.model('User', user);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

const book = new mongoose.Schema({
  book_name: String,
  book_id: Number,
  book_cover_url: String,
  author_name: String,
  price: Number
});

const Book = mongoose.model('Book', book);

const issuedBook = new mongoose.Schema({
  book_name: String,
  book_cover: String,
  author_name: String,
  price: Number,
  issued_date: Date,
  return_date: Date,
  user_id: String,
  user_name: String
});

const IssuedBook = mongoose.model('IssuedBook', issuedBook);

const bookRequests = new mongoose.Schema({
  book_name: String,
  author_name: String,
  user_id: String,
  user_name: String,
  request_logged_date: Date,
  request_status: String
});

const BookRequest = mongoose.model('BookRequest', bookRequests);

/* Facebook Login */
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    callbackURL: "https://lib-mgmt-system.herokuapp.com/auth/facebook/home",
    profileFields: ["email", "first_name", "last_name"]
  },
  function(accessToken, refreshToken, profile, done) {
    User.findOrCreate({faceBookId: profile.id, loggedInTime: new Date()}, function(err, user) {
      if (err) { return done(err); }
      done(null, user);
     });
  }
));

app.get("/auth/facebook", passport.authenticate("facebook"));

app.get("/auth/facebook/home",
  passport.authenticate("facebook",{successRedirect: "/home",failureRedirect: "/login" }));


/* Twitter Login */
passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: "https://lib-mgmt-system.herokuapp.com/auth/twitter/home"
  },
  function(token, tokenSecret, profile, done) {
    User.find({twitterId: profile.id}, function(err, foundUser){
      if(err){
        console.log(err);
      } else {
        if(foundUser.length > 0){
          User.findOneAndUpdate({twitterId: foundUser[0].twitterId},{loggedInTime: new Date()},function(err){
            if(err) {
              console.log(err);
            } else {
              //console.log("Login Time Updated");
            }
          });
          return done(err, foundUser);
        } else {
          User.create({first_name: profile.displayName, last_name: profile.username ,twitterId: profile.id, loggedInTime: new Date()}, function(err, createdUser){
            if(err){
              console.log(err);
            } else {
              return done(err, createdUser);
            }
          });
        }
      }
    });
  }
));

app.get("/auth/twitter", passport.authenticate("twitter"));

app.get("/auth/twitter/home",
  passport.authenticate("twitter", {failureRedirect: "/login" }), function(req, res){
      const data = req.user;
        User.find({
          twitterId: data.twitterId
        }, function(err, result){
          if(err){
            console.log(err);
          } else {
            if(result.length > 0) {
              if(result[0].member_type){
                if(result[0].member_type === "Admin") {
                  res.redirect("/admin/home");
                } else {
                  res.redirect("/home");
                }
              } else {
                res.render("other-login-redirect",{formData: data});
              }
            }
          }
        });
    });


/* Google Login */

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lib-mgmt-system.herokuapp.com/auth/google/home",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, done) {
      User.find({googleId: profile.id}, function(err, foundUser){
        if(err){
          console.log(err);
        } else {
          if(foundUser.length > 0){
            User.findOneAndUpdate({googleId: foundUser[0].googleId},{loggedInTime: new Date()},function(err){
              if(err) {
                console.log(err);
              } else {
                //console.log("Member Type Updated");
              }
            });
            return done(err, foundUser);
          } else {
            User.create({first_name: profile.name.givenName, last_name: profile.name.familyName ,googleId: profile.id, loggedInTime: new Date()}, function(err, createdUser){
              if(err){
                console.log(err);
              } else {
                return done(err, createdUser);
              }
            });
          }
        }
      });
  }
));

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/home",
  passport.authenticate("google", { failureRedirect: "/login"}),
  function(req, res) {
    const userData = req.user;
    let data;
    if(Array.isArray(userData)) {
       data = userData[0];
    } else {
      data = userData;
    }
    User.find({
      googleId: data.googleId
    }, function(err, result){
      if(err){
        console.log(err);
      } else {
        if(result.length > 0) {
          if(result[0].member_type){
            if(result[0].member_type === "Admin") {
              res.redirect("/admin/home");
            } else {
              res.redirect("/home");
            }
          } else {
            res.render("other-login-redirect",{formData: data});
          }
        }
      }
    });
  });

  // Get Requests
  app.get("/", function(req, res){
    res.render("login",{error:""});
  });

  app.get("/login", function(req, res){
    res.render("login",{error:""});
  });

  app.get("/register", function(req, res){
    res.render("register", {formData: "",error:""});
  });

  app.get("/logout", function(req, res){
       setTimeout(function(){
         req.logout();
         res.redirect("/login");
       }, 500);
  });

app.get("/home", function(req, res){
  if(req.isAuthenticated()){
    const homePage = {
      allBooks: [],
      myBooks: [],
      myRequests: []
    };
    Book.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result.length > 0) {
          homePage.allBooks = result;
        } else {
          homePage.allBooks = [];
        }
      }
    });
    IssuedBook.find({
      user_id: req.user._id
    }, function(err, issuedBooks){
      if(err){
        console.log(err);
      } else {
        if(issuedBooks.length > 0){
          homePage.myBooks = issuedBooks;
        } else {
          homePage.myBooks = [];
        }
      }
    });
    BookRequest.find({
      user_id: req.user._id
    }, function(err, requests){
      if(err){
        console.log(err);
      } else {
        if(requests.length > 0){
          homePage.myRequests = requests;
          setTimeout(function(){res.render("globalview", {home: homePage});},1000);
        } else {
          homePage.myRequests = [];
          setTimeout(function(){res.render("globalview", {home: homePage});},1000);
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/request_a_book", function(req, res){
  if(req.isAuthenticated()) {
      res.render("book-request", {bookName: ""});
  } else {
    res.redirect("/login");
  }
});

app.get("/user_profile", function(req, res){
  if(req.isAuthenticated()) {
    const userData = req.user;
    let data;
    if(Array.isArray(userData)) {
      data = userData[0];
    } else {
      data = userData;
    }
    User.find({
      _id: data._id
    }, function(err, foundUser){
      if(err){
        console.log(err);
      } else {
        if(foundUser.length > 0){
          res.render("user-profile",{user: foundUser[0], error: ""});
        }
      }
    });
  } else {
   res.redirect("/login");
  }
});


app.get("/all_books", function(req, res){
  if(req.isAuthenticated()) {
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
      } else {
        if(books.length > 0) {
          IssuedBook.find({
            user_id: req.user._id
          }, function(err, issuedBooks){
            if(err){
              console.log(err);
            } else {
              if(issuedBooks.length > 0){
                res.render("all-books", {allBooks: books, issuedBooks: issuedBooks});
              } else {
                res.render("all-books", {allBooks: books, issuedBooks: ""});
              }
            }
          });
        }
      }
    });
  } else {
   res.redirect("/login");
  }
});

app.get("/all_books_list", function(req, res){
  if(req.isAuthenticated()) {
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
      } else {
        if(books.length > 0) {
          IssuedBook.find({
            user_id: req.user._id
          }, function(err, issuedBooks){
            if(err){
              console.log(err);
            } else {
              if(issuedBooks.length > 0){
                res.render("all-books-listview", {allBooks: books, issuedBooks: issuedBooks});
              } else {
                res.render("all-books-listview", {allBooks: books, issuedBooks: ""});
              }
            }
          });
        }
      }
    });
  } else {
   res.redirect("/login");
  }
});

app.get("/view_requests", function(req, res){
  if(req.isAuthenticated()) {
    BookRequest.find({
      user_id: req.user._id
    }, function(err, requests){
      if(err){
        console.log(err);
      } else {
        if(requests.length > 0){
          res.render("view-requests",{allRequests: requests});
        } else {
          res.render("view-requests",{allRequests: ""});
        }
      }
    });
  } else {
   res.redirect("/login");
  }
});

app.get("/my_books", function(req, res){
if(req.isAuthenticated()){
  IssuedBook.find({
    user_id: req.user._id
  }, function(err, result){
    if(err){
      console.log(err);
      res.render("my-books",{myBooksData:""});
    } else {
      if(result.length > 0){
        res.render("my-books",{myBooksData:result});
      } else {
          res.render("my-books",{myBooksData:""});
      }
    }
  });
} else {
  res.redirect("/login");
}
});

app.get("/my_books_list", function(req, res){
  if(req.isAuthenticated()){
    IssuedBook.find({
      user_id: req.user._id
    }, function(err, result){
      if(err){
        console.log(err);
        res.render("my-books-list",{myBooksData:""});
      } else {
        if(result.length > 0){
          res.render("my-books-list",{myBooksData:result});
        } else {
            res.render("my-books-list",{myBooksData:""});
        }
      }
    });
} else {
  res.redirect("/login");
}
});

app.get("/admin/home", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
    const homePage = {
      allBooks: [],
      issuedBooks: [],
      bookRequests: [],
      allUsers: []
    };
    Book.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result.length > 0) {
          homePage.allBooks = result;
        } else {
          homePage.allBooks = [];
        }
      }
    });
    IssuedBook.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result.length > 0) {
          homePage.issuedBooks = result;
        } else {
          homePage.issuedBooks = [];
        }
      }
    });
    BookRequest.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result) {
          homePage.bookRequests = result;
        } else {
          homePage.bookRequests = [];
        }
      }
    });
    User.find({}, function(err, result){
      if(err){
        console.log(err);
      } else {
        if(result.length > 0) {
          homePage.allUsers = result;
          setTimeout(function(){ res.render("global-view-admin",{home: homePage}); }, 2000);
        } else {
          homePage.allUsers = [];
          setTimeout(function(){ res.render("global-view-admin",{home: homePage}); }, 1500);
        }
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/add_book", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
      res.render("add-book-admin",{errors: "", bookData:"", bookRequest: false, requestStatus: ""});
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/issued_books", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin") {
    IssuedBook.find({}, function (err, result){
      if(err) {
        console.log(err);
      } else {
        res.render("issued-books-admin",{issuedBooks: result});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/issued_books_list", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
    IssuedBook.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
          res.render("issued-books-list-admin", {issuedBooksList:result});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/all_books", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
    Book.find({}, function(err, result){
      if(err) {
        console.log(err);
        res.redirect("/admin/home");
      } else {
        res.render("all-books-admin",{allBooks:result});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/all_books_list", function(req, res){
  if(req.isAuthenticated()) {
    if(req.user.member_type === "Admin"){
    Book.find({}, function(err, result){
      if(err) {
        console.log(err);
        res.redirect("/admin/home");
      } else {
        res.render("all-books-admin-list",{allBooks:result});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/all_book_requests", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
    BookRequest.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        res.render("all-book-requests-admin",{requests: result});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/all_users", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
    User.find({}, function(err, result){
      if(err) {
        console.log(err);
      } else {
        res.render("all-users-admin", {users: result,loggedInUser: req.user.email});
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/add_user", function(req, res){
  if(req.isAuthenticated()){
    if(req.user.member_type === "Admin"){
      res.render("add-user-admin", {user: {fname:"",lname:"",email:""}, error: ""});
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/admin/user_profile", function(req, res){
  if(req.isAuthenticated()) {
    if(req.user.member_type === "Admin"){
    const userInfo = req.user;
    let data;
    if(Array.isArray(userInfo)){
      data = userInfo[0];
    } else {
      data = userInfo;
    }
    User.find({
      _id: data._id
    }, function(err, foundUser){
      if(err){
        console.log(err);
      } else {
        if(foundUser.length > 0){
          res.render("user-profile-admin",{currentUser: foundUser[0], error: ""});
        }
      }
    });
  } else {
    res.redirect("/home");
  }
  } else {
    res.redirect("/login");
  }
});

// Post Requests

app.post("/user_profile/change_password", function(req, res){
  if(req.isAuthenticated()){
    const data = req.body;
    if(data.new_password === data.confirm_new_password){
      User.findById(req.user._id)
      .then(foundUser => {
          foundUser.changePassword(data.old_password, data.new_password)
              .then(() => {
                  res.redirect("/user_profile");
              })
              .catch((error) => {
                  console.log(error);
                  if(error.name === "IncorrectPasswordError"){
                    res.render("user-profile",{user: req.user, error:"Existing Password doesn't match, please try again!"});
                  }
              })
      })
      .catch((error) => {
          console.log(error);
          res.redirect("/user_profile");
      });
    } else {
      res.render("user-profile", {user: req.user, error:"New Passwords doesn't match, please try again!"});
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/pending_requests", function(req, res){
  if(req.isAuthenticated()){
    BookRequest.find({
      request_status: "Pending"
    }, function(err, result){
      if(err) {
        console.log(err);
      } else {
        res.render("all-book-requests-admin",{requests: result});
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/user_profile/change_password", function(req, res){
  if(req.isAuthenticated()){
    const data = req.body;
    if(data.new_password === data.confirm_new_password){
      User.findById(req.user._id)
      .then(foundUser => {
          foundUser.changePassword(data.old_password, data.new_password)
              .then(() => {
                console.log("THEN");
                  res.redirect("/admin/user_profile");
              })
              .catch((error) => {
                  console.log(error);
                  if(error.name === "IncorrectPasswordError"){
                    res.render("user-profile-admin",{currentUser:req.user, error:"Existing Password doesn't match, please try again!"});
                  }
              })
      })
      .catch((error) => {
          console.log(error);
          res.redirect("/admin/user_profile");
      });
    } else {
      res.render("user-profile-admin", {currentUser: req.user,error:"New Passwords doesn't match, please try again!"});
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/other_login", function(req, res){
  if(req.body.googleId) {
    User.findOneAndUpdate({
      googleId: req.body.googleId
    },{
      member_type: req.body.memberType
    }, function(err){
      if(err) {
        console.log(err);
      } else {
        if(req.body.memberType === "Admin") {
          res.redirect("/admin/home");
        } else {
          res.redirect("/home")
        }
      }
    });
  } else if (req.body.twitterId) {
    User.find({
      twitterId: req.body.twitterId
    }, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result.length > 0) {
          User.updateOne({
            _id: result[0]._id
          },{
            member_type: req.body.memberType
          },function(err){
            if(err) {
              console.log(err);
            } else {
              if(req.body.memberType === "Admin") {
                res.redirect("/admin/home");
              } else {
                res.redirect("/home")
              }
            }
          });
        }
      }
    });
  } else {
    User.findOneAndUpdate({
      faceBookId: req.body.faceBookId
    },{
      member_type: req.body.memberType
    }, function(err){
      if(err) {
        console.log(err);
      } else {
        if(req.body.memberType === "Admin") {
          res.redirect("/admin/home");
        } else {
          res.redirect("/home")
        }
      }
    });
  }
});

app.post("/register", function(req, res){
  const data = req.body;
  const userInfo = new User({username: lodash.trim(data.email), first_name: lodash.trim(data.fname), last_name: lodash.trim(data.lname), email: lodash.trim(data.email), member_type: data.memberType, loggedInTime: new Date()});
  const str = lodash.trim(data.email);
  function splCharacterAndNumCheck(data){
    const splChar = ['!','@','#','$','%','^','&','*','(',')','-','_','+','=',';',':','{','}','|'];
    let spl = 0;
    let num = 0;
    splChar.forEach( (spcl) => {
      if(String(data).includes(spcl)){
        spl += 1;
      }
    });

    for(let i = 0; i < String(data).length; i ++){
      if(String(data).includes(i)){
        num += 1;
      }
    }
    if(spl === 0 && num === 0){
      return true;
    } else if ( spl === 0){
      return true;
    } else if( num === 0 ){
      return true;
    } else {
      return false;
    }
  }

if(data.password !== data.confirm_password) {
  res.render("register",{formData:data,error:"Passwords doesn't match, please try again!"});
} else if (str.includes("@") === false || str.includes(".", str.search("@")) === false) {
  res.render("register",{formData:data,error:"Please enter a valid Email Address!"});
} else if (String(data.password).length < 8){
  res.render("register",{formData:data,error:"Password should be greater than or equal to 8 characters!"});
} else if(splCharacterAndNumCheck(data.password)){
  res.render("register",{formData:data,error:"Password should have at least 1 special character and a number!"});
} else {
  User.register(userInfo, data.password, function(err, user){
    if(err){
      console.log(err);
      if(err.name === "UserExistsError") {
        res.render("register",{formData: data,error: "User already exists! Please enter a different email address."})
      }
    } else {
      if(data.memberType === "Admin") {
        passport.authenticate("local")(req, res, function(){
          res.redirect("/admin/home");
        });
      } else {
        passport.authenticate("local")(req, res, function(){
          res.redirect("/home");
        });
      }
    }
  });
}
});

app.post("/login", function(req, res){
  const data = req.body;
  const userInfo = new User({username: lodash.trim(data.email), password: data.password});
  if(data.email && data.password){
    User.find({
      email: lodash.trim(data.email)
    }, function(err, result){
      if(err) {
        console.log(err);
      } else {
        if(result.length > 0 ){
        const member_Type = result[0].member_type;
        User.updateOne({
          _id: result[0]._id
        },{
          loggedInTime: new Date()
        }, function(err){
          if(err){
            console.log(err);
          }
        });
        if(member_Type === "Admin") {
          req.login(userInfo, function(err){
            if (err) {
              console.log(err);
            } else {
              passport.authenticate("local", function(err, user, info) {
                  if (err) { return next(err) }
                  if (!user) {
              return res.render("login", { error: "Incorrect Password" });
              }
                req.logIn(user, function(err) {
                    if (err) { return next(err); }
                      return res.redirect("/admin/home");
                      });
                      })(req, res);
            }
          });
        } else {
          passport.authenticate("local", function(err, user, info) {
              if (err) { return next(err) }
              if (!user) {
          return res.render("login", { error: "Incorrect Password" })
          }
            req.logIn(user, function(err) {
                if (err) { return next(err); }
                  return res.redirect("/home");
                  });
                  })(req, res);
        }
        } else {
          res.render("login",{error:"User doesn't exist, please register!"});
        }
      }
    });
  } else {
    res.render("login",{error:"Please enter a valid email address and password!"});
  }
});

app.post("/my_books", function(req, res){
  const data = lodash.split(req.body.return, ",");
  IssuedBook.findOneAndDelete({
    book_name: data[0],
    author_name: data[1],
    user_id: data[2]
  }, function(err){
    if(err){
      console.log(err);
      res.redirect("/my_books");
    } else {
      res.redirect("/my_books");
    }
  });
});

app.post("/my_books_list", function(req, res){
  const data = lodash.split(req.body.return, ",");
  IssuedBook.findOneAndDelete({
    book_name: data[0],
    author_name: data[1],
    user_id: data[2]
  }, function(err){
    if(err){
      console.log(err);
      res.redirect("/my_books_list");
    } else {
      res.redirect("/my_books_list");
    }
  });
});

app.post("/all_books/issue", function(req, res){
  function addDays(date, add){
  const result = new Date(date);
  result.setDate(result.getDate() + add);
  return result;
  }
  const book = lodash.split(req.body.issue, ",");
  const today = new Date();
  const addedDate = addDays(today, 10);
  let returnFullDate;
  if(String(addedDate.getMonth()).length > 1 && String(addedDate.getDate()).length > 1){
     returnFullDate =  addedDate.getFullYear() + "-" + (addedDate.getMonth() + 1) + "-" + addedDate.getDate();
  } else if (String(addedDate.getMonth()).length > 1 && String(addedDate.getDate()).length === 1){
    returnFullDate =  addedDate.getFullYear() + "-" + (addedDate.getMonth() + 1) + "-" + "0" + addedDate.getDate();
  } else if (String(addedDate.getMonth()).length === 1 && String(addedDate.getDate()).length > 1){
    returnFullDate =  addedDate.getFullYear() + "-" + "0" + (addedDate.getMonth() + 1) + "-" + addedDate.getDate();
  } else {
     returnFullDate =  addedDate.getFullYear() + "-" + "0" + (addedDate.getMonth() + 1) + "-" + "0" + addedDate.getDate();
  }
  console.log(returnFullDate);
  const min = today.getFullYear() + "-" + "0" + (today.getMonth() + 1) + "-" + today.getDate();
  if(req.isAuthenticated()){
    res.render("issue",{bookInfo: book, returnDate: returnFullDate, minDate: min});
  } else {
    res.redirect("/login");
  }
});


app.post("/issue", function(req, res){
  if(req.isAuthenticated()) {
      const data = req.body;
      const fullname = req.user.first_name + " " + req.user.last_name;
      const date = new Date();
      let issuedDate;
      if(String(date.getMonth()).length > 1 && String(date.getDate()).length > 1){
         issuedDate =  date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
      } else if (String(date.getMonth()).length > 1 && String(date.getDate()).length === 1){
        issuedDate =  date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + "0" + date.getDate();
      } else if (String(date.getMonth()).length === 1 && String(date.getDate()).length > 1){
        issuedDate =  date.getFullYear() + "-" + "0" + (date.getMonth() + 1) + "-" + date.getDate();
      } else {
         issuedDate =  date.getFullYear() + "-" + "0" + (date.getMonth() + 1) + "-" + "0" + date.getDate();
      }

      IssuedBook.create({
        book_name: data.bookName,
        book_cover: data.bookCover,
        author_name: data.authorName,
        price: data.price,
        issued_date: issuedDate,
        return_date: data.returnDate,
        user_name: fullname,
        user_id: req.user._id
      }, function(err){
        if(err){
          console.log(err);
          res.redirect("/all_books");
        } else {
          res.redirect("/my_books");
        }
      });
  } else {
   res.redirect("/login");
  }
});

app.post("/admin/add_user", function(req, res){
  if(req.isAuthenticated()){
    const data = req.body;
    const userInfo = new User({username: lodash.trim(data.email), first_name: lodash.trim(data.fname), last_name: lodash.trim(data.lname), email: lodash.trim(data.email), member_type: data.memberType});
    User.register(userInfo, data.passwordHidden, function(err, user){
      if(err){
        console.log(err);
        if(err.name === "UserExistsError") {
          res.render("add-user-admin",{user: data, error: "User already exists! Please enter a different email address."})
        }
      } else {
        res.redirect("/admin/all_users");
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/add_book", function(req, res){
  const data = req.body;
  const bookName = data.book_name;
  const bookId = data.book_id;
  const bookCoverURL = data.book_cover_url;
  const authorName = data.author_name;
  const price = data.price;

  Book.find({
    book_name: lodash.trim(bookName),
    author_name: lodash.trim(authorName)
  }, function(err, result){
    if(err) {
      console.log(err);
    } else {
      if(result.length > 0) {
        res.render("add-book-admin", {bookData: data, errors: "There is a Book already available with the same name from the entered Author Name!",bookRequest: false});
      } else {
        Book.find({
          book_id: bookId
        }, function(err, result){
          if(err) {
            console.log(err);
          } else {
            if(result.length > 0) {
              res.render("add-book-admin", {bookData: data, errors: "There is a Book already available with the same Id, enter a unique Book ID!", bookRequest: false});
            } else {
              Book.create({
                book_name: lodash.trim(bookName),
                book_id: bookId,
                book_cover_url: lodash.trim(bookCoverURL),
                author_name: lodash.trim(authorName),
                price: price
              }, function(err){
                if(err) {
                  console.log(err);
                } else {
                  if(data.requestStatus){
                    BookRequest.findOneAndUpdate({
                      book_name: bookName,
                      author_name: authorName
                    },{
                      request_status: data.requestStatus
                    }, function(err){
                      if(err){
                        console.log(err);
                      } else {
                        //console.log("Book Request Update");
                      }
                    });
                  }
                  res.redirect("/admin/all_books");
                }
              });
            }
          }
        });
      }
    }
  });
});

app.post("/admin/all_users", function(req, res){
  if(req.isAuthenticated()){
    const userId = req.body.del_user_button;
    User.findByIdAndDelete({
      _id: userId
    }, function(err){
      if(err){
        console.log(err);
        res.redirect("/admin/all_users");
      } else {
        setTimeout(function(){res.redirect("/admin/all_users");}, 1500);
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/request_a_book", function(req, res){
  const data = req.body;
  BookRequest.find({
    book_name: data.book_name,
    author_name: data.author_name
  }, function(err, result){
    if(err){
      console.log(err);
    } else {
      if(result.length > 0) {
        if(result[0].user_id === req.user._id){
          res.render("book-request", {bookName:data.book_name, user: "you"});
        } else {
          res.render("book-request", {bookName:data.book_name});
        }
      } else {
        let addedDate = new Date();
        let requestDate;
        if(String(addedDate.getMonth()).length > 1 && String(addedDate.getDate()).length > 1){
           requestDate =  addedDate.getFullYear() + "-" + (addedDate.getMonth() + 1) + "-" + addedDate.getDate();
        } else if (String(addedDate.getMonth()).length > 1 && String(addedDate.getDate()).length === 1){
          requestDate =  addedDate.getFullYear() + "-" + (addedDate.getMonth() + 1) + "-" + "0" + addedDate.getDate();
        } else if (String(addedDate.getMonth()).length === 1 && String(addedDate.getDate()).length > 1){
          requestDate =  addedDate.getFullYear() + "-" + "0" + (addedDate.getMonth() + 1) + "-" + addedDate.getDate();
        } else {
           requestDate =  addedDate.getFullYear() + "-" + "0" + (addedDate.getMonth() + 1) + "-" + "0" + addedDate.getDate();
        }
        const fullName = req.user.first_name + " " + req.user.last_name;
        BookRequest.create({
          book_name: lodash.trim(data.book_name),
          author_name: lodash.trim(data.author_name),
          request_logged_date: requestDate,
          request_status: "Pending",
          user_id: req.user._id,
          user_name: fullName
        }, function(err){
          if(err) {
            console.log(err);
          } else {
            res.redirect("/view_requests");
          }
        });
      }
    }
  });
});

app.post("/admin/all_books/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/admin/all_books");
      } else {
        if(books.length > 0){
          res.render("search-all-books-admin",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search-all-books-admin",{searchedBooks: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/all_books_list/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/admin/all_books");
      } else {
        if(books.length > 0){
          res.render("search-all-books-admin",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search-all-books-admin",{searchedBooks: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/all_book_requests", function(req, res){
  if(req.isAuthenticated()){
    const data = lodash.split(req.body.book_added, ",");
    res.render("add-book-admin",{bookName: data[0], authorName: data[1], bookRequest: true, errors: "",requestStatus: "Book Added"});
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/issued_books/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    IssuedBook.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/admin/issued_books");
      } else {
        if(books.length > 0){
          res.render("search-admin",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search-admin",{searchedBooks: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/admin/issued_books_list/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    IssuedBook.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/admin/issued_books");
      } else {
        if(books.length > 0){
          res.render("search-admin",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search-admin",{searchedBooks: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/my_books/search",function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    IssuedBook.find({
      user_id: req.user._id
    }, function(err, issuedBooks){
      if(err){
        console.log(err);
        res.redirect("/my_books");
      } else {
        if(issuedBooks.length > 0){
          res.render("my-books-search",{searchedBooks:issuedBooks, bookName: bookName});
        } else {
          res.render("my-books-search",{searchedBooks: "", bookName: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/my_books_list/search",function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    IssuedBook.find({
      user_id: req.user._id
    }, function(err, issuedBooks){
      if(err){
        console.log(err);
        res.redirect("/my_books");
      } else {
        if(issuedBooks.length > 0){
          res.render("my-books-search",{searchedBooks:issuedBooks, bookName: bookName});
        } else {
          res.render("my-books-search",{searchedBooks: "", bookName: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/all_books/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/all_books");
      } else {
        if(books.length > 0) {
          res.render("search",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search",{searchedBooks: "",bookName: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/all_books_list/search", function(req, res){
  if(req.isAuthenticated()){
    const bookName = req.body.search_text;
    Book.find({}, function(err, books){
      if(err){
        console.log(err);
        res.redirect("/all_books");
      } else {
        if(books.length > 0) {
          res.render("search",{searchedBooks: books, bookName: bookName});
        } else {
          res.render("search",{searchedBooks: "",bookName: ""});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});


app.listen(process.env.PORT || 5000, function(){
  console.log("Server has started on PORT - 5000");
});
