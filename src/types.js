/*
    type.js

    TODO: Make types immutable
*/

//
// -- Helpers --
//

const isNotNull = x => x !== undefined && x !== null && x !== NaN
const isType = name => v => isNotNull(v) && typeof v === name
const isFunction = isType('function')
const isObject = isType('object')
const isString = isType('string')
const isNumber = isType('number')
const isBoolean = isType('boolean')
const isArray = Array.isArray

const throwError = e => {
    throw new TypeError(e)
}
const trace = msg => v => {
    console.log(msg, v)
    return v
}
const Pipe = x => ({
    andThen: fn => Pipe(fn(x)),
    value: () => x
})

const hasFields = (fields, obj) =>
    isObject(obj) && isArray(fields)
        ? fields.filter(f => !obj.hasOwnProperty(f)).length === 0
        : false
const toObject = (obj, [key, value]) =>
    Object.assign(obj, {
        [key]: value
    })
const setPrototype = proto => obj => {
    // TODO: Replace with Object.create() because setPrototypeOf can have a
    //       serious performance impact.
    if (isNotNull(obj)) {
        Object.setPrototypeOf(obj, proto)
    }
    // obj.prototype = Object.create(proto)
    return obj
}

//
// -- Type Type --
//

//
// Find a way of freezing objects to make them immutable. Maybe use:
// seamless-immutable..?
//
// Type :: String -> Fn -> (a -> a)
const Type = (name, typecheck, constructor = x => x) => {
    const obj = {
        [name]: function(val) {
            return Pipe(constructor(val))
                .andThen(trace(name + ': Type: Val:'))
                .andThen(
                    v =>
                        typecheck(v)
                            ? v
                            : throwError(
                                  `Value '${val}' is not of expected type '${name}'`
                              )
                )

                .andThen(setPrototype({ constructor: obj[name] }))
                .value()
        }
    }
    // Constructor typecheck?
    obj[name].is = v =>
        isNotNull(v) && v.prototype && v.prototype.constructor
            ? v.prototype.constuctor === obj[name]
            : typecheck(v)
    // obj[name].is = typecheck
    obj[name].toString = () => name + '(x)'
    obj[name].inspect = () => name + '(x)'
    return obj[name]
}

const StringType = Type('String', isString, String)
const ObjectType = Type('Object', isObject, Object)
const NumberType = Type('Number', isNumber, Number)
const BooleanType = Type('Boolean', isBoolean, Boolean)
const ArrayType = Type('Boolean', Array.isArray, Array)

const typeMap = {}
typeMap[String] = StringType
typeMap[Object] = ObjectType
typeMap[Number] = NumberType
typeMap[Boolean] = BooleanType
typeMap[Array] = ArrayType

// const replaceWithTypecheckedVersion = constructor =>
const getTypecheckedCounterpart = constructor =>
    typeMap[constructor] !== undefined ? typeMap[constructor] : constructor

//
// -- Data Type --
//

const normalizeDefinition = def =>
    // Replace default type constructor (eg. String) with our typechecked
    // counterparts.
    Object.entries(def)
        .map(([name, typeConstructor]) => [
            name,
            isObject(typeConstructor)
                ? normalizeDefinition(typeConstructor)
                : getTypecheckedCounterpart(typeConstructor)
        ])
        .reduce(toObject, {})

// Every object is a valid definition
const isValidDataDefinition = isObject

// Structural typecheck
const typecheckData = typeDef => val =>
    isObject(val) &&
    hasFields(Object.keys(typeDef), val) &&
    // Filter out all keys that pass the typecheck
    Object.entries(typeDef).filter(([key, type]) => !type.is(val[key]))
        .length === 0

const constructData = typeDef => data =>
    Object.entries(typeDef)
        .map(([key, typeConstructor]) => [key, typeConstructor(data[key])])
        .reduce(toObject, {})

//
//
//
// Data :: (String, Object) => Constructor
const Data = (name, typeDef) =>
    // 1. Check if we have a valid data type definition
    // 2. Create a constructor out of the type definition.
    isValidDataDefinition(typeDef)
        ? Pipe(normalizeDefinition(typeDef))
              .andThen(def =>
                  Type(name, typecheckData(def), constructData(def))
              )
              .value()
        : throwError(
              'Data: Type definition must consist only of functions and objects containing functions'
          )

//
// -- Union Type --
//

const isValidUnionDefinition = def =>
    // Filter out all functions. Everything that's left is unwanted.
    Object.values(def).filter(d => !isFunction(d)).length === 0

const caseOf = (typeDef, val) => opts => {
    const match = Object.entries(typeDef)
        .filter(([name, type]) => type.is(val))
        .map(([name, type]) => name)
    const name = match[0]
    const fn = opts[name]
    return !!fn ? fn(val) : throwError(`${name} is not in the object!`)
}

// Union ::
const Union = (name, typeDef) =>
    // Check if typedef just containing functions
    isValidUnionDefinition(typeDef)
        ? Pipe(normalizeDefinition(typeDef))
              .andThen(def =>
                  Object.entries(def)
                      .map(([name, type]) => [name, Type(name, type.is, type)])
                      .reduce(
                          toObject,
                          Object.create({
                              toString: () => name,
                              is: x =>
                                  Object.values(def).filter(type => type.is(x))
                                      .length > 0,
                              case: (v, opts) => caseOf(def, v)(opts)
                          })
                      )
              )
              //   .andThen(Object.freeze)
              .value()
        : // wrong type definition
          throwError('Union: Type definition must consist only of functions')

//
// -- Maybe Type --
//

const AnyType = Type('Any', v => isNotNull(v))
const NothingType = Type('Nothing', v => !isNotNull(v), x => undefined)

// const Just = Data('Any', { value: AnyType })
// const Nothing = Data('Any', {})

const Maybe = Union('Maybe', {
    // Just: Data('Just', { value: AnyType }),
    // Nothing: Data('Nothing', { value: NothingType })
    Just: AnyType,
    Nothing: NothingType
})

//
// -- Result Type --
//

const SuccessType = Type(
    'Ok',
    v => isObject(v) && v.ok === true && AnyType.is(v.value),
    v => ({ ok: true, value: AnyType(v) })
)
const ErrorType = Type(
    'Error',
    v => isObject(v) && v.ok === false && StringType.is(v.error),
    v => ({ ok: false, error: String(v) })
)
const Result = Union('Result', {
    Ok: SuccessType,
    Err: ErrorType
})

//
module.exports = {
    Type,
    Data, // Type
    Union,
    Maybe,
    Result,

    // Typechecked primitive type counterparts
    String: StringType,
    Object: ObjectType,
    Number: NumberType,
    Boolean: BooleanType,
    Array: ArrayType,
    Any: AnyType,
    Nothing: NothingType,
    Success: SuccessType,
    Error: ErrorType
}

/*

const { Maybe } = require("./type.js")

const j = Maybe.Just("Hey Ho!")
const n = Maybe.Nothing()

Maybe.case(j, {
    Just: (v) => console.log("Just: ", v),
    Nothing: (v) => console.log("Nothing: ", v)
})
Maybe.case(n, {
    Just: (v) => console.log("Just: ", v),
    Nothing: (v) => console.log("Nothing: ", v)
})


const { Result } = require("./type.js")

const a = Result.Ok({ Some: "Data" })
a
const e = Result.Err("Oje Oje..")
e



const Type = require("./type.js")

const Coord = Type.Type('Coord', Type.Number.is)
Coord.toString()
Coord.name
const c = Coord(23)
c
Coord.is(c)

const Point = Type.Data("Point", { x: Coord, y: Coord, z: Number })
Point.toString()
Point.name
const p = Point({ x: 1, y: 1, z: 1 })
p
Point.is(p)

const Space = Type.Union("Space", {
    Planet: Point,
    SolarSystem: Point
})
Space.toString()
const s = Space.Planet(p)
s
s.toString()
Space.is(s)

Space.case(s, {
    Planet: (s) => "It's a planet",
    SolarSystem: (s) => "It's a solar system"
})

// s.case({
//     Planet: (s) => console.log("It's a planet"),
//     SolarSystem: (s) => console.log("It's a solar system")
// })


*/

// const Daggy = require('daggy')

// const Type = Daggy.tagged
// const Union = Daggy.taggedSum

// const Maybe = Union('Maybe', {
//     Just: ['x'],
//     Nothing: []
// })
// Maybe.prototype.case = Maybe.prototype.cata
// Maybe.prototype.map = function(f) {
//     return this.case({
//         Just: x => Maybe.Just(f(x)),
//         Nothing: () => this
//     })
// }

// const Result = Union('Result', {
//     Ok: ['value'],
//     Err: ['error']
// })
