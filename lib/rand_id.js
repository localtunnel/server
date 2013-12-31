// all url safe
// can't use uppercase because hostnames are lowercased
var chars = 'abcdefghijklmnopqrstuvwxyz';

module.exports = function rand_id() {
    var randomstring = '';
    for (var i=0; i<10; ++i) {
        var rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars[rnum];
    }

    return randomstring;
}
