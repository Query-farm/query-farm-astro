import test from 'node:test';
import assert from 'node:assert/strict';
import {checkChallengeResult as check, challengeCell} from '../src/lib/tutorial-challenge';
import {Field, Decimal} from 'apache-arrow';

test('aggregate Decimal128 and HUGEINT values retain numeric meaning',()=>{
  const field=new Field('total',new Decimal(0,38,128));
  assert.equal(challengeCell(new Uint32Array([25500,0,0,0]),field),25500n);
  assert.equal(challengeCell(new Uint32Array([0xffffffff,0xffffffff,0xffffffff,0xffffffff]),field),-1n);
  assert.equal(challengeCell({__int128:28000n}),28000n);
  assert.equal(check(['total'],[[challengeCell(new Uint32Array([25500,0,0,0]),field)]],['total'],[[25500]]).passed,true);
});

test('equivalent row orders and Arrow integer values pass',()=>{
  assert.equal(check(['ID','name'],[[9n,'Cedar'],[7n,'Cedar']],['id','name'],[[7,'Cedar'],[9,'Cedar']]).passed,true);
});
test('duplicate counts matter, even with the same row count',()=>{
  assert.equal(check(['id'],[[7],[7]],['id'],[[7],[9]]).passed,false);
  assert.equal(check(['id'],[[7],[9],[9]],['id'],[[7],[9]]).passed,false);
});
test('NULL and literal text or numeric strings are distinct',()=>{
  assert.equal(check(['value'],[[null]],['value'],[[undefined]]).passed,true);
  assert.equal(check(['value'],[['NULL']],['value'],[[null]]).passed,false);
  assert.equal(check(['value'],[['5']],['value'],[[5]]).passed,false);
});
test('column names/order and actual values are checked',()=>{
  assert.equal(check(['name','id'],[['Eli',5]],['id','name'],[[5,'Eli']]).passed,false);
  assert.equal(check(['id','name'],[[5,'Ada']],['id','name'],[[5,'Eli']]).passed,false);
  assert.equal(check(['id','name'],[[5,'Eli']],['id','name'],[[5,'Eli']]).passed,true);
});
