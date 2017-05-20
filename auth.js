const local_strategy = require('passport-local').Strategy;

module.exports = function (dependencies) {
  const passport = dependencies['passport'];
  const db = dependencies['db'];

  passport.use(new local_strategy(
    function (username, password, done) {
      console.log('username ', username, password)
      db.check_user_password(username, password).then(
        function (result) {
          if (!result) {
            return done (null, false);
          }
          return done (null, username);
        }
      );
    }
  ));

  passport.serializeUser(function (username, done) {
    done (null, username);
  })

  passport.deserializeUser(function (username, done) {
    done (null, username);
  })

  const is_logged_in = function() {
    return function (req, res, next) {
      if (req.isAuthenticated()) {
        return next();
      }
      res.redirect('/login');
    }
  };

  const already_logged_in = function() {
    return function (req, res, next) {
      if (req.isAuthenticated()) {
        res.redirect('/profile');
        return;
      }
      return next();
    }
  };

  const login = function (failure) {
    return passport.authenticate('local', {failureRedirect : failure});
  }

  return {
    is_logged_in,
    login,
    already_logged_in
  }

}